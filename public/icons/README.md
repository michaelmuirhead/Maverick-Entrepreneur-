# Icons

`icon.svg` is the source. For production, render it to PNGs at 192 and 512 px:

```bash
# if you have librsvg installed:
rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png

# or via ImageMagick:
magick -background none -size 192x192 icon.svg icon-192.png
magick -background none -size 512x512 icon.svg icon-512.png
```

You can also drop `icon.svg` into any online SVG-to-PNG converter. iOS Safari is happy with SVG but a PNG fallback is safer for install.
