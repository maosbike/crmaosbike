---
description: Lanza la auditoría completa de consistencia del CRM (diseño, UI, React, backend) con reparación y evaluación.
argument-hint: "[alcance opcional: frontend | backend | all | nombre-de-vista]"
---

Invoca al agente `design-consistency-lead` para auditar el CRM `crmaosbike` y corregir la inconsistencia tipo Frankenstein acumulada entre sesiones.

Alcance solicitado: $ARGUMENTS (si está vacío, audita **todo** con foco en hotspots del frontend).

Pasos esperados del lead:
1. Planificar y leer docs de diseño existentes.
2. Lanzar en paralelo los auditores: `design-tokens-auditor`, `ui-pattern-auditor`, `react-pattern-auditor`, `backend-consistency-auditor`.
3. Consolidar hallazgos en `docs/consistency-audit-<fecha>.md` y proponer top 10 fixes.
4. Esperar aprobación del usuario.
5. Para cada fix aprobado: `consistency-repair` → `consistency-evaluator` → iterar si es rechazado.
6. Resumen final con lo hecho, lo pendiente, y riesgos.

Reglas:
- No commitear sin aprobación del usuario.
- No introducir features nuevas; solo consistencia.
- Respetar decisiones en `frontend/design-tokens-audit.md` y `design-tokens-sla-orange-mapping.md`.
