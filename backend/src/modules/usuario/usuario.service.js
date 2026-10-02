import { usuarioRepository } from './usuario.repository.js';
import { hashPassword } from '../../core/password.js';
import { badRequest, notFound } from '../../core/httpError.js';
import { toBool } from '../../core/sql.js';

const ROLES = ['EMPLEADO', 'CAJERO', 'ADMINISTRADOR', 'SUPERADMINISTRADOR'];

function assertRol(rol) {
  if (rol === null || rol === undefined) return null;
  if (!ROLES.includes(rol)) throw badRequest(`Rol invalido: ${rol}`);
  return rol;
}

function normalizeActivo(row) {
  if (!row) return row;
  return { ...row, activo: !!row.activo, cuentaEnCualquierSucursal: !!row.cuentaEnCualquierSucursal };
}

export const usuarioService = {
  async getAllActive() {
    return (await usuarioRepository.findAllActive()).map(normalizeActivo);
  },
  async getAllIncludingInactive() {
    return (await usuarioRepository.findAll()).map(normalizeActivo);
  },
  async getById(id) {
    return normalizeActivo(await usuarioRepository.findByIdActive(id));
  },
  async getEmpleados() {
    return (await usuarioRepository.findEmpleados()).map(normalizeActivo);
  },
  async create(dto) {
    const contrasenia = dto.contrasenia ? await hashPassword(dto.contrasenia) : null;
    const row = await usuarioRepository.insert({
      nombre: dto.nombre ?? null,
      apellido: dto.apellido ?? null,
      nombreUsuario: dto.nombreUsuario ?? null,
      contrasenia,
      rol: assertRol(dto.rol),
      sucursalId: dto.sucursalId ?? null,
      cuentaEnCualquierSucursal: !!dto.cuentaEnCualquierSucursal,
    });
    return normalizeActivo(row);
  },
  async update(id, dto) {
    const existing = await usuarioRepository.findById(id);
    if (!existing) return null;
    const assignments = {
      nombre: dto.nombre ?? undefined,
      apellido: dto.apellido ?? undefined,
      nombre_usuario: dto.nombreUsuario ?? undefined,
      rol: dto.rol === undefined ? undefined : assertRol(dto.rol),
      sucursal_id: dto.sucursalId ?? undefined,
      cuenta_en_cualquier_sucursal:
        dto.cuentaEnCualquierSucursal === undefined ? undefined : toBool(dto.cuentaEnCualquierSucursal),
      activo: dto.activo === undefined || dto.activo === null ? undefined : toBool(dto.activo),
    };
    if (dto.contrasenia) {
      assignments.contrasenia = await hashPassword(dto.contrasenia);
    }
    return normalizeActivo(await usuarioRepository.updateFields(id, assignments));
  },
  async resetPassword(id, newPassword) {
    const existing = await usuarioRepository.findById(id);
    if (!existing) throw notFound(`Usuario no encontrado con id: ${id}`);
    const contrasenia = await hashPassword(String(newPassword));
    await usuarioRepository.updateFields(id, { contrasenia });
  },
  async deactivate(id) {
    const existing = await usuarioRepository.findById(id);
    if (!existing) throw notFound(`Usuario no encontrado con id: ${id}`);
    await usuarioRepository.updateFields(id, { activo: 0 });
  },
};
