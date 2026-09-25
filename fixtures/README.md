# Fixtures

The coding agent does not install `exiftool` or ImageMagick. Emmanuel
generates these fixtures locally, from a `base.jpg` placed in this
directory, using the exact commands from RDD.md:

```bash
cd fixtures
exiftool -GPSLatitude=34.0522 -GPSLatitudeRef=N -GPSLongitude=118.2437 -GPSLongitudeRef=W \
  -SerialNumber=TEST123 -o gps.jpg base.jpg
exiftool -Orientation=6 -n -o rotated.jpg base.jpg
# Leaking-thumbnail fixture: main image cropped, thumbnail still from the original
magick base.jpg -crop 50%x50%+0+0 cropped.jpg
magick base.jpg -resize 160x120 thumb_original.jpg
exiftool "-ThumbnailImage<=thumb_original.jpg" -o thumb-leak.jpg cropped.jpg
# Add one iPhone HEIC photo as iphone.heic
```

`tests/leaks.test.ts` runs a conditional test against `fixtures/gps.jpg`
when it exists, but does not require it (or any other fixture here) to pass.
