// AIDEV-NOTE: libheif-js ships no type declarations for the wasm-bundle subpath.
// Declaring it untyped here (rather than inline in decode.ts) is required — TS
// rejects `declare module` augmentations of an already-resolved untyped module from
// within a regular module file. The actual shape is resolved defensively at runtime
// in decode.ts's decodeHeic().
declare module "libheif-js/wasm-bundle";
