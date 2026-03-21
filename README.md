# ToniBBQ

App web movil-first para organizar una barbacoa con amigos en el Tejar de Somontes.

## Modos de sincronizacion

- `Supabase`: modo online recomendado para despliegue.
- `server.py`: modo local por Wi-Fi para probar con varios moviles sin depender de Supabase.
- Si no configuras ninguno, la app sigue funcionando en modo demo local del navegador.

## Archivos importantes

- `tonibbq/index.html`: interfaz principal.
- `tonibbq/styles.css`: estilos.
- `tonibbq/app.js`: logica de ToniBBQ y sincronizacion.
- `tonibbq/config.js`: aqui eliges backend local o Supabase.
- `tonibbq/supabase-schema.sql`: esquema SQL para crear la tabla y las policies.
- `tonibbq/vercel.json`: configuracion sencilla para desplegar en Vercel.
- `tonibbq/server.py`: servidor local para guardar grupos en JSON y compartir por la misma Wi-Fi.
- `tonibbq/package.json`: base de Capacitor para Android/iPhone.
- `tonibbq/capacitor.config.json`: identidad de la app nativa.
- `tonibbq/AUDIT_TOP10.md`: auditoria resumida con prioridades.

## Opcion 1: arrancar con servidor local

1. Ejecuta `python server.py`.
2. Averigua la IP local de tu ordenador en la misma Wi-Fi.
3. En `tonibbq/config.js` pon `backendUrl: "http://TU-IP:8042"`.
4. Abre `http://TU-IP:8042` desde los moviles.

Ejemplo:

```js
window.TONIBBQ_CONFIG = {
    backendUrl: "http://192.168.1.25:8042",
    supabaseUrl: "",
    supabaseAnonKey: ""
};
```

## Opcion 2: arrancar con Supabase

1. Crea un proyecto en Supabase.
2. En el editor SQL de Supabase ejecuta `tonibbq/supabase-schema.sql`.
3. Copia la `Project URL` y la `anon public key` de Supabase.
4. Pegalas en `tonibbq/config.js`.
5. Sube la carpeta a un repo de GitHub.
6. Importa ese repo en Vercel y despliega.

## Configuracion del cliente

En `tonibbq/config.js` puedes dejar algo asi:

```js
window.TONIBBQ_CONFIG = {
    backendUrl: "",
    supabaseUrl: "https://TU-PROYECTO.supabase.co",
    supabaseAnonKey: "TU_ANON_KEY"
};
```

## Como funciona

- Cada grupo de barbacoa se guarda como una fila en `bbq_groups` o como un JSON local si usas `server.py`.
- El plan, los amigos, los items y el chat viven en columnas JSON.
- La app usa realtime con Supabase o polling ligero con `server.py`.
- Cuando un amigo cambia compras o manda un mensaje, el resto lo ve al momento.
- Incluye onboarding guiado, resumen ejecutivo, filtros de compra, marcado de compras, archivado automatico de planes pasados y envio de fotos en ToniChat.
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
