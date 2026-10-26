# Medicamentos con la tabla existente de Aiven

Prisma y la API están adaptados a la definición `SHOW CREATE TABLE medicamento`
facilitada por el equipo: `DECIMAL(10,2)`, fechas `DATE`, campos opcionales,
UUID por defecto, umbral de resurtido de 5 días y eliminación por cascada.
No se necesita crear o alterar la tabla en Aiven. No se ha modificado Aiven.

El módulo permite registrar, listar, editar y eliminar por familiar. No incluye
registro de tomas, recordatorios automáticos ni cálculo de días de existencias.
El umbral se guarda como configuración; todavía no genera avisos.

## Ejecutar con Aiven

Actualizar ambos repositorios y conservar el `.env` y `certs/ca.pem` existentes.
Desde la raíz del backend:

```bash
npm ci
npm run typecheck
npm run build
npm run dev
```

`npm ci` genera el cliente Prisma actualizado. No ejecutar `prisma db push`,
semillas ni resets contra la base compartida. Las consultas de
`src/database/prisma/sql/inspeccionar-medicamentos.sql` son de solo lectura y
sirven para comprobar el esquema si cambia en el futuro.

## Contrato HTTP

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/familiares/:id/medicamentos` | 200, lista del familiar |
| POST | `/familiares/:id/medicamentos` | 201, medicamento creado |
| PUT | `/familiares/:id/medicamentos/:medicamentoId` | 200, reemplazo del medicamento |
| DELETE | `/familiares/:id/medicamentos/:medicamentoId` | 204, sin cuerpo |

Cuerpo de ejemplo (los UUID `id` y `recipientID` son opcionales; si se envían,
se validan y deben coincidir con la ruta):

```json
{
  "name": "Medicamento indicado por el médico",
  "presentation": "Tableta",
  "dose": "0.50",
  "unit": "mg",
  "frequency": "Según indicación médica",
  "startDate": "2026-01-10",
  "endDate": null,
  "indication": null,
  "stock": "20.25",
  "refillThresholdDays": 5
}
```

Solo `name`, `dose` y `startDate` son obligatorios. `refillThresholdDays` toma 5
si se omite. Los otros campos admiten NULL o pueden omitirse. PUT es un reemplazo:
los opcionales omitidos se limpian y el umbral omitido vuelve a 5.

| Campo JSON | Columna existente | Validación |
| --- | --- | --- |
| `name` | `nombre` | Texto obligatorio, hasta 120 caracteres |
| `presentation` | `presentacion` | Texto opcional, hasta 60 |
| `dose` | `dosis` | Texto decimal positivo, hasta 8 enteros y 2 decimales |
| `unit` | `unidad` | Texto opcional, hasta 10 |
| `frequency` | `frecuencia` | Texto opcional, hasta 60 |
| `indication` | `indicacion` | Texto opcional, hasta 65535 bytes UTF-8 |
| `startDate` / `endDate` | `inicio` / `fin` | Fecha real `YYYY-MM-DD`; fin no anterior al inicio |
| `stock` | `existencias` | Texto decimal opcional no negativo, hasta 8 enteros y 2 decimales |
| `refillThresholdDays` | `umbral_resurtido_dias` | Entero entre 0 y 32767 |

Los decimales viajan como **cadenas JSON**, por ejemplo `"0.50"`, para conservar
precisión. La respuesta siempre usa dos decimales. Las fechas no llevan hora ni
huso horario. No existen `route`, `prescribingDoctor` ni `status` en el contrato.
La app clasifica como Anteriores los tratamientos cuyo `endDate` ya pasó, según
la fecha local del dispositivo. No se escribe un estado en la base.

Datos inválidos devuelven 400; UUID duplicado, 409; familiar inexistente o
medicamento fuera del familiar de la ruta, 404. Eliminar un familiar elimina sus
medicamentos por la relación ya existente. La autorización por usuario sigue el
alcance actual del backend; estas rutas no añaden autenticación nueva.

## Pruebas con copia local de la tabla

Se ejecutaron ocho pruebas con MySQL 8.4 y la definición real, conservada en
`test/fixtures/medicamento.aiven.sql`. No se probaron contra Aiven. La suite
requiere `TEST_DATABASE_URL` de loopback y nombre de base terminado en `_test`;
no toma el `DATABASE_URL` del `.env`. Crea y limpia sus familiares ficticios.

Crear una **base nueva y vacía de pruebas** en el MySQL local de Docker Compose:

```sql
CREATE DATABASE cruzcontigo_medicamentos_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON cruzcontigo_medicamentos_test.* TO 'cruzcontigo'@'%';
```

Desde la raíz del backend, inicializar las tablas locales:

```bash
DATABASE_URL='mysql://cruzcontigo:cruzcontigo@127.0.0.1:3306/cruzcontigo_medicamentos_test' DB_CA_PATH='' npx prisma db push
```

Prisma no modela los CHECK de MySQL. En **esa base local nueva y vacía**,
reemplazar únicamente la tabla recién generada por la copia exacta antes de
probar. Estos comandos usan las credenciales de desarrollo de Docker Compose:

```bash
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" -Dcruzcontigo_medicamentos_test -e "DROP TABLE medicamento;"'
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" -Dcruzcontigo_medicamentos_test' < test/fixtures/medicamento.aiven.sql
TEST_DATABASE_URL='mysql://cruzcontigo:cruzcontigo@127.0.0.1:3306/cruzcontigo_medicamentos_test' npm run test:medicamentos
```

No repetir el DROP sobre una base con datos que se quieran conservar. La suite
comprueba registro/listado, separación por familiar, validaciones, edición,
nulos/defaults, CHECK y UUID del SQL real, eliminación y cascada. El diff de
Prisma contra esta copia no detectó diferencias; los CHECK se verifican además
con escrituras inválidas directamente en la base.

La app iOS debe compilarse y probarse con Xcode en macOS. Linux no tiene el SDK.
