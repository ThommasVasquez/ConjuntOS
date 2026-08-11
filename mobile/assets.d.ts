// Ambient declarations for Metro's bundled static assets.
//
// Without these, reaching an image requires `require('…png')`, which trips
// @typescript-eslint/no-require-imports (the rule that was being suppressed
// ad-hoc across screens). With them, a normal ES import typechecks and lints
// clean, and Metro still resolves the asset to its numeric module id.
declare module '*.png' {
  const asset: number;
  export default asset;
}
declare module '*.jpg' {
  const asset: number;
  export default asset;
}
declare module '*.jpeg' {
  const asset: number;
  export default asset;
}
declare module '*.gif' {
  const asset: number;
  export default asset;
}
declare module '*.webp' {
  const asset: number;
  export default asset;
}
declare module '*.mp3' {
  const asset: number;
  export default asset;
}
