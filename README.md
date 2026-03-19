# ToniBBQ

App web movil-first para organizar una barbacoa con amigos en el Tejar de Somontes.

## Stack gratuito recomendado

- Frontend estatico en Vercel
- Base de datos compartida en Supabase
- Realtime de Supabase para compras y chat

## Archivos importantes

- `tonibbq/index.html`: interfaz principal.
- `tonibbq/styles.css`: estilos.
- `tonibbq/app.js`: logica de ToniBBQ conectada a Supabase.
- `tonibbq/config.js`: aqui pegas tu URL y anon key de Supabase.
- `tonibbq/supabase-schema.sql`: esquema SQL para crear la tabla y las policies.
- `tonibbq/vercel.json`: configuracion sencilla para desplegar en Vercel.

## Pasos para arrancar gratis

1. Crea un proyecto en Supabase.
2. En el editor SQL de Supabase ejecuta `tonibbq/supabase-schema.sql`.
3. Copia la `Project URL` y la `anon public key` de Supabase.
4. Pegalas en `tonibbq/config.js`.
5. Sube la carpeta a un repo de GitHub.
6. Importa ese repo en Vercel y despliega.

## Configuracion del cliente

En `tonibbq/config.js` deja algo asi:

```js
window.TONIBBQ_CONFIG = {
    supabaseUrl: "https://TU-PROYECTO.supabase.co",
    supabaseAnonKey: "TU_ANON_KEY"
};
```

## Como funciona

- Cada grupo de barbacoa se guarda como una fila en `bbq_groups`.
- El plan, los amigos, los items y el chat viven en columnas JSON.
- La app se suscribe a cambios realtime del grupo activo.
- Cuando un amigo cambia compras o manda un mensaje, el resto lo ve al momento.
- Incluye onboarding guiado, resumen ejecutivo, filtros de compra, marcado de compras y modo instalable.
- Registra un `service-worker` para cargar el shell de la app mas rapido y sentirse mas nativa.

## Nota de seguridad

Esta version esta pensada para arrancar rapido gratis y con friccion minima. Las policies actuales dejan acceso anonimo a leer y escribir grupos, asi que es un MVP funcional, no una configuracion endurecida para produccion grande.

## Siguiente paso recomendado

Cuando quieras endurecerla de verdad:

- login por magic link
- invitaciones por grupo
- policies por miembro del grupo
- notificaciones push
- separar grupos, items y mensajes en tablas dedicadas
