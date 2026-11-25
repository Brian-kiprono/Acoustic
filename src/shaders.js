/**
 * Stage 5 Production Shaders
 * Connects preset wave parameters (uWaveSpeed, uWaveIntensity), real-time audio spectrum
 * (uBass, uMid, uTreble, uAmplitude, uDistribution), cursor proximity & ripples,
 * and finite-difference normal perturbation into a single GPU pass.
 */

const NOISE_GLSL = /* glsl */ `
  vec4 permute(vec4 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
  }
  vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
  }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 1.0 / 7.0;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  float fbm2(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 3; i++) {
      value += amp * snoise(vec3(p * 2.4, 0.35));
      p *= 2.05;
      amp *= 0.5;
    }
    return value;
  }
`;

export const sculptureVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMotionScale;
  uniform float uWaveSpeed;
  uniform float uWaveIntensity;

  uniform vec3 uMouseWorld;
  uniform float uMouseActive;
  uniform float uCursorPolarity;
  uniform vec3 uRippleOrigin;
  uniform float uRippleAge;
  uniform float uRippleStrength;

  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uAmplitude;
  uniform float uDistribution;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  varying float vDisplacement;
  varying float vCursorInfluence;
  varying float vRippleEnergy;
  varying float vAudioEnergy;

  ${NOISE_GLSL}

  float computeDisplacement(vec3 localPos, vec3 localNormal, out float outCursor, out float outRipple) {
    float speedBoost = uWaveSpeed * (1.0 + uMid * 1.45 + uTreble * 0.9);
    float t = uTime * uMotionScale * speedBoost;

    float waveAmp = (0.042 + uMid * 0.14 + uAmplitude * 0.05) * uWaveIntensity;
    float waveA = sin(localPos.x * 2.2 + localPos.y * 1.1 - t * 2.1);
    float waveB = cos(localPos.y * 3.1 - localPos.x * 1.4 + t * 1.65) * 0.65;
    float waveC = sin(length(localPos.xy) * 2.6 - t * 2.8) * 0.45;
    float waves = (waveA + waveB + waveC) * waveAmp;

    float bassSwell = uBass * 0.24 * (0.65 + 0.35 * sin(localPos.x * 1.15 - uTime * 3.2));
    float n1 = snoise(localPos * 1.15 + vec3(t * 0.28, -t * 0.22, t * 0.32));
    float n2 = snoise(localPos * 2.5 - vec3(0.0, t * 0.45, -t * 0.25)) * 0.35;
    float organicAmp = (0.068 + uAmplitude * 0.14) * uWaveIntensity;
    float organic = (n1 + n2) * organicAmp;

    float trebleShimmer = snoise(localPos * 5.2 + vec3(0.0, 0.0, uTime * 6.5)) * uTreble * 0.065;

    vec3 worldPt = (modelMatrix * vec4(localPos, 1.0)).xyz;
    float distToMouse = distance(worldPt.xy, uMouseWorld.xy);
    float radius = 2.45 + uAmplitude * 0.45;
    float proximity = pow(clamp(1.0 - distToMouse / radius, 0.0, 1.0), 2.0) * uMouseActive;
    outCursor = proximity;
    float cursorDisp = proximity * uCursorPolarity * 0.28;

    outRipple = 0.0;
    float rippleDisp = 0.0;
    if (uRippleAge >= 0.0 && uRippleStrength > 0.001) {
      float rDist = distance(worldPt.xy, uRippleOrigin.xy);
      float waveFront = uRippleAge * 4.4;
      float band = exp(-pow((rDist - waveFront) * 2.2, 2.0));
      float decay = exp(-uRippleAge * 1.35) * uRippleStrength;
      outRipple = band * decay;
      rippleDisp = sin((rDist - waveFront) * 9.0) * band * decay * 0.24;
    }

    float total = waves + bassSwell + organic + trebleShimmer + cursorDisp + rippleDisp;
    return total * (0.2 + 0.8 * uMotionScale);
  }

  void main() {
    vUv = uv;

    float cursorInf = 0.0;
    float rippleInf = 0.0;
    float disp = computeDisplacement(position, normal, cursorInf, rippleInf);

    float breatheScale = 1.0 + uAmplitude * 0.055 + uBass * 0.04;
    vec3 displacedLocal = position * breatheScale + normal * disp;

    float eps = 0.035;
    vec3 tangent = normalize(cross(normal, abs(normal.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 bitangent = cross(normal, tangent);

    float dummyA = 0.0;
    float dummyB = 0.0;
    float dispT = computeDisplacement(position + tangent * eps, normal, dummyA, dummyB);
    float dispB = computeDisplacement(position + bitangent * eps, normal, dummyA, dummyB);

    vec3 p0 = position + normal * disp;
    vec3 p1 = (position + tangent * eps) + normal * dispT;
    vec3 p2 = (position + bitangent * eps) + normal * dispB;
    vec3 perturbedNormal = normalize(cross(p1 - p0, p2 - p0));

    vec3 finalLocalNormal = normalize(mix(normal, perturbedNormal, 0.75));

    vec4 worldPosition = modelMatrix * vec4(displacedLocal, 1.0);
    vWorldPosition = worldPosition.xyz;

    vec4 mvPosition = viewMatrix * worldPosition;
    vViewPosition = -mvPosition.xyz;

    vNormal = normalize(normalMatrix * finalLocalNormal);
    vDisplacement = disp;
    vCursorInfluence = cursorInf;
    vRippleEnergy = rippleInf;
    vAudioEnergy = clamp(uBass * 0.45 + uMid * 0.35 + uTreble * 0.45 + uAmplitude * 0.35, 0.0, 1.5);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const sculptureFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform vec3 uPrimaryAccent;
  uniform vec3 uSecondaryAccent;
  uniform vec3 uHighlightColor;
  uniform float uFresnelPower;

  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uAmplitude;
  uniform float uDistribution;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  varying float vDisplacement;
  varying float vCursorInfluence;
  varying float vRippleEnergy;
  varying float vAudioEnergy;

  ${NOISE_GLSL}

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    vec3 keyLightDir = normalize(vec3(0.65, 0.78, 0.68));
    vec3 rimLightDir = normalize(vec3(-0.85, 0.35, -0.5));
    vec3 fillLightDir = normalize(vec3(0.1, -0.75, 0.55));

    float keyDiff = max(dot(normal, keyLightDir), 0.0);
    float rimDiff = max(dot(normal, rimLightDir), 0.0);
    float fillDiff = max(dot(normal, fillLightDir), 0.0);

    float shininess = 56.0 + uTreble * 48.0;
    vec3 halfVector = normalize(keyLightDir + viewDir);
    float specular = pow(max(dot(normal, halfVector), 0.0), shininess);

    float grain = fbm2(vWorldPosition.xy * 2.8 + vWorldPosition.z * 1.9);
    float fresnel = pow(1.0 - abs(dot(normal, viewDir)), max(1.1, uFresnelPower - uAmplitude * 0.65));

    float sweep = clamp(
      0.35 + 0.3 * sin(vWorldPosition.x * 0.65 + uTime * (0.45 + uMid * 1.2))
      + (uDistribution - 0.5) * 0.55
      + vDisplacement * 1.6,
      0.0,
      1.0
    );
    vec3 accentColor = mix(uPrimaryAccent, uSecondaryAccent, sweep);

    vec3 color = uBaseColor + grain * (0.025 + uTreble * 0.03);
    color += accentColor * (keyDiff * (0.38 + uBass * 0.25) + fillDiff * 0.14);
    color += uSecondaryAccent * rimDiff * (0.36 + uMid * 0.25);
    color += uHighlightColor * specular * (0.5 + uTreble * 0.45);

    float interactiveGlow = clamp(
      vCursorInfluence * 0.65 + vRippleEnergy * 1.25 + vAudioEnergy * 0.55,
      0.0,
      1.6
    );
    color += accentColor * fresnel * (0.85 + interactiveGlow * 0.5);
    color += mix(uSecondaryAccent, uHighlightColor, clamp(0.35 + uTreble * 0.45, 0.0, 0.85))
           * interactiveGlow * 0.38;

    gl_FragColor = vec4(color, 1.0);
  }
`;