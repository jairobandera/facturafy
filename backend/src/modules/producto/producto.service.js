import { query, transaction } from '../../config/db.js';
import { badRequest, notFound, forbidden } from '../../core/httpError.js';
import { productoRepository, normalizeProducto } from './producto.repository.js';

function validateProductoDto(dto) {
  if (dto.imagen) {
    if (!/^data:image\/(jpeg|png);base64,.+/.test(dto.imagen)) {
      throw badRequest('La imagen debe ser un base64 valido de tipo JPEG o PNG');
    }
    const base64Data = dto.imagen.split(',')[1] || '';
    const size = Math.floor((base64Data.length * 3) / 4);
    if (size > 5_000_000) throw badRequest('La imagen no debe exceder 5MB');
  }
  if (!dto.nombre) throw badRequest('El nombre del producto es requerido');
  // El codigo de barra NO es obligatorio: hay productos que no lo tienen (granel,
  // servicios) y se cuentan a mano. Se agregan despues desde la pantalla de codigos.
  if (dto.precio === undefined || dto.precio === null || dto.precio < 0) throw badRequest('El precio debe ser mayor o igual a 0');
  // El stock admite negativos: el informe de inventario los trae y hay que poder
  // editar esos productos sin que el formulario los bloquee.
  if (dto.cantidadStock === undefined || dto.cantidadStock === null) throw badRequest('El stock es requerido');
  if (!dto.codigoProducto) throw badRequest('El codigo del producto es requerido');
}

// El codigo de producto es unico DENTRO de la sucursal: el mismo producto fisico
// puede estar dado de alta en el deposito y en el local, cada uno con su stock.
async function assertCodigoProductoUnico(conn, codigo, id, sucursalId) {
  if (!sucursalId) throw badRequest('Se requiere sucursalId para validar el codigo de producto');
  const [rows] = await conn.execute(
    `SELECT id FROM producto WHERE codigo_producto = ? AND sucursal_id = ?`, [codigo, sucursalId]
  );
  if (rows.length && (id === null || rows[0].id !== Number(id))) {
    throw badRequest(`El codigo de producto ${codigo} ya esta asignado a otro producto de esta sucursal`);
  }
}

async function resolveCategoria(conn, dto) {
  if (dto.categoriaId) {
    const [rows] = await conn.execute(`SELECT id FROM categoria WHERE id = ?`, [dto.categoriaId]);
    if (!rows.length) throw notFound(`Categoria no encontrada con id: ${dto.categoriaId}`);
    return dto.categoriaId;
  }
  // Sin categoria -> usa/crea "Sin categoria" de la sucursal
  if (!dto.sucursalId) throw badRequest('Se requiere sucursalId o categoriaId');
  return ensureSinCategoria(conn, dto.sucursalId);
}

async function ensureSinCategoria(conn, sucursalId) {
  const [rows] = await conn.execute(
    `SELECT id FROM categoria WHERE LOWER(nombre) = LOWER('Sin categoria') AND sucursal_id = ?`,
    [sucursalId]
  );
  if (rows.length) return rows[0].id;
  const [res] = await conn.execute(
    `INSERT INTO categoria (nombre, descripcion, codigo_categoria, sucursal_id, activo)
     VALUES ('Sin categoria', 'Categoria por defecto para productos sin categoria', 'DEFAULT', ?, 1)`,
    [sucursalId]
  );
  return res.insertId;
}

/**
 * Sincroniza los codigos de barra de un producto. NUNCA borra una fila: a un
 * producto le cambian el EAN y conviven el viejo y el nuevo, asi que los codigos
 * se acumulan y sacar uno es siempre una baja logica (activo = 0).
 *
 * @param {object} [opciones]
 * @param {'merge'|'reemplazar'} [opciones.modo]
 *        'merge' (por defecto): solo agrega/reactiva. Lo usan todas las importaciones.
 *        'reemplazar': ademas desactiva los que no vengan en la lista (formulario).
 * @returns {{agregados: string[], reactivados: string[], desactivados: string[],
 *            yaExistian: string[], conflictos: Array<{codigo: string, codigoProducto: string}>}}
 *        Los conflictos NO se lanzan: los reporta el llamador. Antes un EAN repetido
 *        hacia rollback de la transaccion y se perdia el producto entero.
 */
/**
 * Categoria de una fila del Excel de catalogo. Busca por id, por codigo y por
 * nombre dentro de la sucursal (como hace categoria.crearLote) y, si no existe,
 * la CREA con el codigo y nombre del archivo. Solo cae a "Sin categoria" cuando
 * la fila no trae ninguna referencia.
 * @returns {{id: number, creada: {codigo: string, nombre: string}|null}}
 */
async function resolverCategoriaDeImport(conn, dto, sucursalId) {
  if (dto.categoriaId) {
    const [cat] = await conn.execute(
      `SELECT id FROM categoria WHERE id = ? AND activo = 1 AND sucursal_id = ?`, [dto.categoriaId, sucursalId]
    );
    if (cat.length) return { id: cat[0].id, creada: null };
  }
  const codigo = String(dto.categoriaCodigo ?? '').trim();
  const nombre = String(dto.categoriaNombre ?? '').trim();
  if (!codigo && !nombre) return { id: await ensureSinCategoria(conn, sucursalId), creada: null };

  if (codigo) {
    // Ignora ceros a la izquierda: el Excel trae "95" donde la base tiene "095".
    const [porCodigo] = await conn.execute(
      `SELECT id FROM categoria
        WHERE sucursal_id = ?
          AND TRIM(LEADING '0' FROM codigo_categoria) = TRIM(LEADING '0' FROM ?)
        ORDER BY id LIMIT 1`,
      [sucursalId, codigo]
    );
    if (porCodigo.length) return { id: porCodigo[0].id, creada: null };
  }
  if (nombre) {
    const [porNombre] = await conn.execute(
      `SELECT id FROM categoria WHERE LOWER(nombre) = LOWER(?) AND sucursal_id = ?`, [nombre, sucursalId]
    );
    if (porNombre.length) return { id: porNombre[0].id, creada: null };
  }
  const [res] = await conn.execute(
    `INSERT INTO categoria (nombre, descripcion, codigo_categoria, sucursal_id, activo) VALUES (?,?,?,?,1)`,
    [nombre || `Categoria ${codigo}`, 'Creada al importar el catalogo', codigo || null, sucursalId]
  );
  return { id: res.insertId, creada: { codigo, nombre: nombre || `Categoria ${codigo}` } };
}

async function syncCodigosBarra(conn, productoId, codigos, sucursalId, { modo = 'merge' } = {}) {
  const resumen = { agregados: [], reactivados: [], desactivados: [], yaExistian: [], conflictos: [] };
  if (!codigos) return resumen;
  if (!sucursalId) throw badRequest('Se requiere sucursalId para validar los codigos de barra');
  const limpios = [...new Set(codigos.filter((c) => c && String(c).trim()).map((c) => String(c).trim()))];

  // Si el producto cambio de sucursal, sus barras lo siguen (la columna es una
  // desnormalizacion de producto.sucursal_id que sostiene el UNIQUE compuesto).
  await conn.execute(
    `UPDATE codigo_barra SET sucursal_id = ? WHERE producto_id = ? AND sucursal_id <> ?`,
    [sucursalId, productoId, sucursalId]
  );

  const [existing] = await conn.execute(
    `SELECT codigo, activo FROM codigo_barra WHERE producto_id = ?`, [productoId]
  );
  const propios = new Map(existing.map((e) => [e.codigo, !!e.activo]));

  for (const codigo of limpios) {
    if (propios.has(codigo)) {
      if (propios.get(codigo)) { resumen.yaExistian.push(codigo); continue; }
      await conn.execute(
        `UPDATE codigo_barra SET activo = 1 WHERE producto_id = ? AND codigo = ?`, [productoId, codigo]
      );
      resumen.reactivados.push(codigo);
      continue;
    }
    // La unicidad es POR SUCURSAL: el mismo EAN puede estar en el deposito y en el
    // local, pero no en dos productos de la misma sucursal.
    const [owner] = await conn.execute(
      `SELECT cb.producto_id, p.codigo_producto AS codigoProducto
         FROM codigo_barra cb JOIN producto p ON p.id = cb.producto_id
        WHERE cb.codigo = ? AND cb.sucursal_id = ?`,
      [codigo, sucursalId]
    );
    if (owner.length) {
      resumen.conflictos.push({ codigo, codigoProducto: owner[0].codigoProducto });
      continue;
    }
    await conn.execute(
      `INSERT INTO codigo_barra (codigo, producto_id, sucursal_id, activo) VALUES (?,?,?,1)`,
      [codigo, productoId, sucursalId]
    );
    resumen.agregados.push(codigo);
  }

  if (modo === 'reemplazar') {
    for (const [codigo, activo] of propios) {
      if (activo && !limpios.includes(codigo)) {
        await conn.execute(
          `UPDATE codigo_barra SET activo = 0 WHERE producto_id = ? AND codigo = ?`, [productoId, codigo]
        );
        resumen.desactivados.push(codigo);
      }
    }
  }
  return resumen;
}

/** Mensaje unico para los conflictos, usado por el alta/edicion manual. */
function assertSinConflictos(resumen) {
  if (!resumen.conflictos.length) return;
  const detalle = resumen.conflictos
    .map((c) => `${c.codigo} (es del producto ${c.codigoProducto})`)
    .join(', ');
  throw badRequest(`Estos codigos de barra ya pertenecen a otro producto de esta sucursal: ${detalle}`);
}

/**
 * Por que una fila del import no se puede dar de alta. Devuelve null si esta bien.
 * El mensaje va al resumen de la importacion: "002502 - falta el precio" dice algo,
 * "002502" a secas no. El stock negativo NO es motivo de rechazo (ver crearSimples).
 */
function motivoInvalido(dto) {
  if (!dto.codigoProducto || !String(dto.codigoProducto).trim()) return 'falta el codigo de producto';
  if (!dto.nombre) return 'falta el nombre';
  if (dto.precio === undefined || dto.precio === null) return 'falta el precio';
  if (dto.precio < 0) return `precio negativo (${dto.precio})`;
  if (dto.cantidadStock === undefined || dto.cantidadStock === null) return 'falta el stock';
  return null;
}

async function syncProveedores(conn, productoId, proveedorIds) {
  if (!proveedorIds) return;
  await conn.execute(`DELETE FROM producto_proveedor WHERE producto_id = ?`, [productoId]);
  for (const proveedorId of proveedorIds) {
    const [rows] = await conn.execute(`SELECT id FROM proveedor WHERE id = ? AND activo = 1`, [proveedorId]);
    if (!rows.length) throw notFound(`Proveedor no encontrado con id: ${proveedorId}`);
    await conn.execute(
      `INSERT IGNORE INTO producto_proveedor (producto_id, proveedor_id) VALUES (?,?)`,
      [productoId, proveedorId]
    );
  }
}

export const productoService = {
  getAllActive: () => productoRepository.findAllActive(),
  getAllIncludingInactive: () => productoRepository.findAll(),
  getActiveBySucursal: (id) => productoRepository.findActiveBySucursal(id),
  getBySucursal: (id) => productoRepository.findBySucursal(id),
  getById: (id) => productoRepository.findByIdActive(id),
  getByCodigoProducto: (codigo) => productoRepository.findByCodigoProductoActive(codigo),
  getByCodigoProductoAndSucursal: (codigo, sucursalId) =>
    productoRepository.findByCodigoProductoActiveAndSucursal(codigo, sucursalId),

  // ---- Consulta de precios (kiosko publico) ----
  // Estado de la consulta: si esta habilitada y el nombre de la sucursal. Publico.
  async consultaInfo(sucursalId) {
    const rows = await query(
      `SELECT nombre, usa_facturacion AS f, usa_consulta_precio AS c FROM sucursal WHERE id = ? AND activo = 1`,
      [sucursalId]
    );
    if (!rows.length) throw notFound(`Sucursal no encontrada con id: ${sucursalId}`);
    return { sucursalNombre: rows[0].nombre, habilitado: !!(rows[0].f && rows[0].c) };
  },

  // Busca un producto por codigo de barra o codigo de producto dentro de la sucursal
  // y devuelve SOLO nombre/imagen/precio. Solo si la sucursal tiene la consulta habilitada.
  async consultaPrecio(sucursalId, codigo) {
    const suc = await query(
      `SELECT usa_facturacion AS f, usa_consulta_precio AS c FROM sucursal WHERE id = ? AND activo = 1`,
      [sucursalId]
    );
    if (!suc.length) throw notFound(`Sucursal no encontrada con id: ${sucursalId}`);
    if (!suc[0].f || !suc[0].c) throw forbidden('La consulta de precios no está habilitada para esta sucursal');
    const term = String(codigo || '').trim();
    if (!term) return null;
    const rows = await query(
      `SELECT p.nombre, p.imagen, p.precio
         FROM producto p
        WHERE p.sucursal_id = ? AND p.activo = 1
          AND (p.codigo_producto = ? OR EXISTS (
            SELECT 1 FROM codigo_barra cb
             WHERE cb.producto_id = p.id AND cb.activo = 1 AND cb.codigo = ?))
        LIMIT 1`,
      [sucursalId, term, term]
    );
    if (!rows.length) return null;
    return { nombre: rows[0].nombre, imagen: rows[0].imagen || null, precio: Number(rows[0].precio) };
  },

  async create(dto) {
    validateProductoDto(dto);
    return transaction(async (conn) => {
      await assertCodigoProductoUnico(conn, dto.codigoProducto, null, dto.sucursalId);
      const categoriaId = await resolveCategoria(conn, dto);
      const [res] = await conn.execute(
        `INSERT INTO producto (codigo_producto, imagen, nombre, detalle, precio, cantidad_stock, activo, sucursal_id, categoria_id)
         VALUES (?,?,?,?,?,?,1,?,?)`,
        [dto.codigoProducto, dto.imagen ?? null, dto.nombre, dto.detalle ?? null,
         dto.precio, dto.cantidadStock, dto.sucursalId ?? null, categoriaId]
      );
      assertSinConflictos(await syncCodigosBarra(conn, res.insertId, dto.codigosBarra, dto.sucursalId));
      await syncProveedores(conn, res.insertId, dto.proveedorIds);
      return res.insertId;
    }).then((id) => productoRepository.findByIdHydrated(id));
  },

  async update(id, dto) {
    validateProductoDto(dto);
    const existing = await productoRepository.findByIdRaw(id);
    if (!existing) return null;
    // El formulario no manda sucursalId: se conserva la del producto existente.
    const sucursalId = dto.sucursalId ?? existing.sucursalId;
    await transaction(async (conn) => {
      await assertCodigoProductoUnico(conn, dto.codigoProducto, id, sucursalId);
      const assignments = [];
      const params = [];
      const set = (col, val) => { assignments.push(`${col} = ?`); params.push(val); };
      if (dto.imagen !== undefined) set('imagen', dto.imagen);
      if (dto.nombre !== undefined) set('nombre', dto.nombre);
      if (dto.detalle !== undefined) set('detalle', dto.detalle);
      if (dto.precio !== undefined) set('precio', dto.precio);
      if (dto.cantidadStock !== undefined) set('cantidad_stock', dto.cantidadStock);
      if (dto.sucursalId !== undefined) set('sucursal_id', dto.sucursalId);
      if (dto.categoriaId !== undefined && dto.categoriaId !== null) set('categoria_id', dto.categoriaId);
      if (dto.activo !== undefined && dto.activo !== null) set('activo', dto.activo ? 1 : 0);
      if (dto.codigoProducto !== undefined) set('codigo_producto', dto.codigoProducto);
      if (assignments.length) {
        await conn.execute(`UPDATE producto SET ${assignments.join(', ')} WHERE id = ?`, [...params, id]);
      }
      // Modo merge: guardar el formulario nunca borra codigos. Para sacar uno esta
      // la pantalla de codigos de barra, que hace la baja logica explicita.
      assertSinConflictos(await syncCodigosBarra(conn, Number(id), dto.codigosBarra, sucursalId));
      await syncProveedores(conn, Number(id), dto.proveedorIds);
    });
    return productoRepository.findByIdHydrated(id);
  },

  async deactivate(id) {
    const existing = await productoRepository.findByIdRaw(id);
    if (!existing) throw notFound(`Producto no encontrado con id: ${id}`);
    await query(`UPDATE producto SET activo = 0 WHERE id = ?`, [id]);
  },

  /** Actualiza stock y precio por codigo de producto dentro de una sucursal. */
  async actualizarMasivo(productos, sucursalId) {
    const actualizados = [];
    const noEncontrados = [];
    for (const dto of productos) {
      if (!dto.codigoProducto || !dto.codigoProducto.trim()) {
        noEncontrados.push('Producto sin codigo de producto');
        continue;
      }
      const producto = await productoRepository.findByCodigoProductoAndSucursal(dto.codigoProducto, sucursalId);
      if (!producto) { noEncontrados.push(dto.codigoProducto); continue; }
      const sets = [];
      const params = [];
      if (dto.precio !== undefined && dto.precio !== null && dto.precio >= 0) { sets.push('precio = ?'); params.push(dto.precio); }
      // El stock puede ser negativo (se vendio mas de lo cargado): el informe lo trae
      // asi y antes esas filas se salteaban en silencio, sin aparecer en ninguna lista.
      if (dto.cantidadStock !== undefined && dto.cantidadStock !== null) { sets.push('cantidad_stock = ?'); params.push(dto.cantidadStock); }
      if (sets.length) {
        await query(`UPDATE producto SET ${sets.join(', ')} WHERE id = ?`, [...params, producto.id]);
        actualizados.push(dto.codigoProducto);
      }
    }
    return { mensaje: 'Actualizacion completada.', actualizados, noEncontrados };
  },

  /** Crea productos simples (sin categoria/proveedores obligatorios). */
  async crearSimples(productos, sucursalId) {
    const creados = [];
    const errores = [];
    // Un producto que ya existe no se rechaza: se le fusionan los codigos de barra
    // que traiga el archivo (y nada mas: ni precio ni stock, que los fija el Excel
    // de stock final). Antes la fila entera iba a errores y las barras se perdian.
    const barrasAgregadas = [];
    const conflictos = [];
    const yaExistian = [];
    const categoriasCreadas = [];
    for (const dto of productos) {
      // El codigo de barra es OPCIONAL al importar: no todos los productos lo traen
      // (los que no lo tengan se cuentan manualmente, no se pueden escanear).
      // El stock SI puede ser negativo: el informe de inventario trae negativos
      // cuando se vendio mas de lo que figuraba cargado, y el producto igual existe.
      const faltante = motivoInvalido(dto);
      if (faltante) {
        errores.push(`${dto.codigoProducto || 'Producto sin codigo'} - ${faltante}`);
        continue;
      }
      try {
        const fusionado = await transaction(async (conn) => {
          // Unicidad por sucursal: el mismo catalogo se puede importar en dos sucursales.
          // Las barras las valida syncCodigosBarra mas abajo, tambien por sucursal.
          const [dup] = await conn.execute(
            `SELECT id FROM producto WHERE codigo_producto = ? AND sucursal_id = ?`,
            [dto.codigoProducto, sucursalId]
          );
          if (dup.length) {
            const resumen = await syncCodigosBarra(conn, dup[0].id, dto.codigosBarra, sucursalId);
            for (const c of resumen.agregados.concat(resumen.reactivados)) {
              barrasAgregadas.push({ codigoProducto: dto.codigoProducto, codigo: c });
            }
            for (const c of resumen.conflictos) conflictos.push({ ...c, enProducto: dto.codigoProducto });
            yaExistian.push(dto.codigoProducto);
            return true; // producto ya existente: solo se fusionaron sus barras
          }
          const categoria = await resolverCategoriaDeImport(conn, dto, sucursalId);
          if (categoria.creada) categoriasCreadas.push(categoria.creada);
          const categoriaId = categoria.id;
          const [res] = await conn.execute(
            `INSERT INTO producto (codigo_producto, imagen, nombre, detalle, precio, cantidad_stock, activo, sucursal_id, categoria_id)
             VALUES (?,?,?,?,?,?,1,?,?)`,
            [dto.codigoProducto, dto.imagen ?? null, dto.nombre, dto.detalle ?? null, dto.precio, dto.cantidadStock, sucursalId, categoriaId]
          );
          const resumen = await syncCodigosBarra(conn, res.insertId, dto.codigosBarra, sucursalId);
          for (const c of resumen.conflictos) conflictos.push({ ...c, enProducto: dto.codigoProducto });
          await syncProveedores(conn, res.insertId, dto.proveedorIds);
          return false;
        });
        if (!fusionado) creados.push(dto.codigoProducto);
      } catch (e) {
        errores.push(dto.codigoProducto ? `${dto.codigoProducto} - ${e.message}` : `Producto sin codigo - ${e.message}`);
      }
    }
    return {
      mensaje: 'Carga finalizada',
      recibidos: productos.length, // para que el frontend verifique que no se perdio ninguna fila
      creados, yaExistian, errores, barrasAgregadas, conflictos, categoriasCreadas,
    };
  },

  /**
   * Importacion masiva de codigos de barra sobre productos que ya existen.
   * Siempre ADITIVA: nunca borra ni desactiva nada.
   * @param {Array<{codigoProducto: string, codigosBarra: string[]}>} filas
   */
  async importarCodigosBarra(filas, sucursalId) {
    if (!sucursalId) throw badRequest('sucursalId es requerido');
    const agregadas = [];
    const yaExistian = [];
    const noEncontrados = [];
    const conflictos = [];
    const productosActualizados = new Set();

    for (const fila of filas) {
      const codigoProducto = String(fila.codigoProducto ?? '').trim();
      if (!codigoProducto) continue;
      const codigos = (fila.codigosBarra || []).filter((c) => c && String(c).trim());
      if (!codigos.length) continue;

      const producto = await productoRepository.findByCodigoProductoFlexible(codigoProducto, sucursalId);
      if (!producto) { noEncontrados.push(codigoProducto); continue; }

      const resumen = await transaction((conn) =>
        syncCodigosBarra(conn, producto.id, codigos, sucursalId, { modo: 'merge' }));

      for (const c of resumen.agregados.concat(resumen.reactivados)) agregadas.push({ codigoProducto, codigo: c });
      for (const c of resumen.yaExistian) yaExistian.push({ codigoProducto, codigo: c });
      for (const c of resumen.conflictos) conflictos.push({ ...c, enProducto: codigoProducto });
      if (resumen.agregados.length || resumen.reactivados.length) productosActualizados.add(codigoProducto);
    }

    return {
      mensaje: 'Importacion de codigos de barra finalizada',
      productosActualizados: [...productosActualizados],
      agregadas,
      yaExistian,
      noEncontrados,
      conflictos,
    };
  },

  /**
   * Agrega codigos a un producto (pantalla de codigos de barra). Acepta uno suelto
   * (`codigo`) o varios (`codigos`), y separa por coma, punto y coma, barra o espacio:
   * pegar "123, 456" tiene que dar DOS codigos, no uno con una coma adentro.
   */
  async agregarCodigoBarra(productoId, { codigo, codigos } = {}) {
    const producto = await productoRepository.findByIdRaw(productoId);
    if (!producto) throw notFound(`Producto no encontrado con id: ${productoId}`);
    const crudos = Array.isArray(codigos) ? codigos : [codigo];
    const limpios = crudos
      .flatMap((c) => String(c ?? '').split(/[,;|\s]+/))
      .map((c) => c.trim())
      .filter(Boolean);
    if (!limpios.length) throw badRequest('El codigo de barra es requerido');
    const resumen = await transaction((conn) =>
      syncCodigosBarra(conn, Number(productoId), limpios, producto.sucursalId, { modo: 'merge' }));
    assertSinConflictos(resumen);
    return productoRepository.findByIdHydrated(productoId);
  },

  /** Baja logica de un codigo: deja de escanear pero queda guardado. */
  async quitarCodigoBarra(productoId, codigo) {
    const producto = await productoRepository.findByIdRaw(productoId);
    if (!producto) throw notFound(`Producto no encontrado con id: ${productoId}`);
    const res = await query(
      `UPDATE codigo_barra SET activo = 0 WHERE producto_id = ? AND codigo = ?`,
      [productoId, String(codigo).trim()]
    );
    if (!res.affectedRows) throw notFound(`El producto no tiene el codigo de barra ${codigo}`);
    return productoRepository.findByIdHydrated(productoId);
  },
};
