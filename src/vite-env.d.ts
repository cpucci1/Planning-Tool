/// <reference types="vite/client" />

/**
 * Las variables de entorno del navegador, declaradas con su tipo.
 *
 * Sin esto, `import.meta.env` no existe para TypeScript y cualquier variable
 * nueva se lee como `any`, que es como se cuela una mal escrita: el compilador
 * no dice nada y en produccion sale `undefined`.
 *
 * Las dos son PUBLICAS y acaban dentro del bundle. La clave anonima de Supabase
 * es publica por diseno: lo que protege los datos es la RLS y que las tablas no
 * tengan permisos, no que la clave sea secreta. Aqui NO va nunca una clave de
 * servicio ni la de Gemini.
 */
interface ImportMetaEnv {
  /** URL del proyecto Supabase "freetools". Sin ella, el guardado en servidor se apaga solo. */
  readonly VITE_FREETOOLS_URL?: string
  /** Clave anonima del mismo proyecto. Publica. */
  readonly VITE_FREETOOLS_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
