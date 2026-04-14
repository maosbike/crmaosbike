/**
 * Reglas de ruteo de sucursales — CRMaosBike
 *
 * Motivo de negocio: Movicenter (MOV) no tiene vendedores propios. Los leads
 * capturados con branch_id=MOV se asignan automáticamente al pool de Mall Plaza
 * Norte (MPN) para que sus vendedores los atiendan.
 *
 * Estos IDs coinciden con el seed de branches (002_seed.js / 027_branches_update.sql).
 */

const MOV_ID = 'b0000001-0001-0001-0001-000000000003';
const MPN_ID = 'b0000001-0001-0001-0001-000000000001';

/**
 * Devuelve el branch efectivo para asignación de vendedores.
 * Si el ticket entra como MOV, redirige a MPN.
 */
function resolveAssignmentBranch(rawBranch) {
  if (rawBranch === MOV_ID) return MPN_ID;
  return rawBranch;
}

module.exports = {
  MOV_ID,
  MPN_ID,
  resolveAssignmentBranch,
};
