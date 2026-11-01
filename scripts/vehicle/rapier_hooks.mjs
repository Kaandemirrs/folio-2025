export async function resolve(specifier, context, next){
  try { return await next(specifier, context) }
  catch(e){
    if(e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT'){
      for(const s of [specifier+'.js',specifier+'/index.js']) { try { return await next(s, context) } catch {} }
    }
    throw e
  }
}
// Vite'ta öznitelik olmadan çalışan JSON içe aktarmaları Node'da da çalışsın
export async function load(url, context, next){
  if(url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } })
  return next(url, context)
}
