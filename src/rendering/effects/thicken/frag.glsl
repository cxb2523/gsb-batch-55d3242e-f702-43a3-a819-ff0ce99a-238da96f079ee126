varying vec2 vUv; // (x,y) with x,y in [0,1]
uniform sampler2D tInput;
uniform vec2 texelSize;

// Dilatation radius in texels. Unlike an integer radius this accepts any
// non-negative fractional value: texels inside the radius are fully covered
// and the one-texel band around the disc is anti-aliased, so thin lines no
// longer disappear or jump when the thickness changes continuously.
uniform float thickness;

// Must match MAX_THICKNESS_TEXELS in thickness.ts: GLSL ES 1.0 requires
// constant loop bounds, so the search area is clamped to this radius.
const int MAX_RADIUS = 8;

// Only opaque, (near-)pure-black pixels are considered outline pixels. Using
// an epsilon instead of an exact equality keeps the semantics ("dilate the
// black ink only") while tolerating quantization in the render targets.
bool isBlackPixel(vec4 c) {
    return c.a > 0.5 && dot(c.rgb, c.rgb) < 0.02;
}

// Coverage of a texel at distance `d` texels from a black pixel for a disc of
// radius `r`: fully covered inside the disc, linearly anti-aliased across the
// one-texel band immediately outside it. This is what makes a fractional
// thickness continuous instead of snapping to an integer loop radius.
float discCoverage(float d, float r) {
    if (d <= r) {
        return 1.0;
    } else if (d <= r + 1.0) {
        return clamp(r + 1.0 - d, 0.0, 1.0);
    }
    return 0.0;
}

void main() {
    vec4 base = texture2D(tInput, vUv);

    float r = max(thickness, 0.0);

    // Highest coverage of a black pixel found in the neighborhood. A radius of
    // zero only covers the texel itself, so an existing black pixel stays
    // black and nothing spreads.
    float coverage = isBlackPixel(base) ? 1.0 : 0.0;

    for (int i = -MAX_RADIUS; i <= MAX_RADIUS; i++) {
        for (int j = -MAX_RADIUS; j <= MAX_RADIUS; j++) {
            float fi = float(i);
            float fj = float(j);
            float d = length(vec2(fi, fj));

            // Skip texels outside the disc plus its anti-aliasing band, and
            // anything beyond the supported radius.
            if (d > r + 1.0 || d > float(MAX_RADIUS) + 1.0) {
                continue;
            }

            vec4 smpl = texture2D(
                tInput,
                vUv + vec2(fi, fj) * texelSize
            );
            if (isBlackPixel(smpl)) {
                coverage = max(coverage, discCoverage(d, r));
            }
        }
    }

    vec4 black = vec4(vec3(0.), 1.);

    // Mix towards black by the coverage. Transparent background pixels with no
    // black neighbor keep coverage == 0 and are therefore untouched, so the
    // dilation never bleeds ink into the transparent background.
    gl_FragColor.rgba = mix(base, black, coverage);
}
