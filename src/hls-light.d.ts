// У облегчённой сборки hls.js нет своих типов: у неё тот же API, что у полной.
declare module 'hls.js/light' {
  import Hls from 'hls.js'
  export default Hls
}
