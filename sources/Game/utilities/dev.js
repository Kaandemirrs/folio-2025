// Geliştirici araçları (debug paneli, #stats, #inspector, #skip) yalnızca development'ta
// veya build sırasında VITE_DEBUG tanımlıysa açılır. Production'da sabit false olur ve ilgili kod pakete girmez.
export const DEV_TOOLS = !!(import.meta.env.DEV || import.meta.env.VITE_DEBUG)

// location.hash'te bu araç adı var mı (yalnızca DEV_TOOLS açıkken)
export const hasHash = (name) => DEV_TOOLS && !!location.hash.match(new RegExp(name, 'i'))
