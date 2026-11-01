export async function resolve(specifier, context, next){
  try { return await next(specifier, context) }
  catch(e){
    if(e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT'){
      for(const s of [specifier+'.js',specifier+'/index.js']) { try { return await next(s, context) } catch {} }
    }
    throw e
  }
}
