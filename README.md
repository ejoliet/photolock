# photolock

See what your photos leak, strip it, and resize for any platform — in the
browser, with proof that nothing is uploaded.

Drop in your photos and photolock shows every EXIF/XMP/IPTC/ICC block they
carry (GPS location, camera serial, and more), flags an embedded thumbnail
that still shows the original uncropped image, then re-encodes clean copies
sized for the platforms you pick — all without a single network request after
the page loads. A one-time Pro unlock adds face-blur redaction, folder
write-back, and shareable recipes.

Full spec: [RDD.md](./RDD.md). Setup and manual checks: [DEVELOPER.md](./DEVELOPER.md).

## Quick start

```bash
npm ci
npm run dev              # http://localhost:5173/photolock/
npm run build             # dist/          hosted build
npm run build:offline     # dist-offline/photolock.html  single file, works with Wi-Fi off
npm test
```
