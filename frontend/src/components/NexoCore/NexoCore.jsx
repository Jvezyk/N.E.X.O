import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import './NexoCore.css';

// N.E.X.O. / NEBULA CORE 06.2
// Esfera sugerida por trajetórias de luz — sem placas, cascos ou sprites opacos.
// Mantém a interface da aplicação: <NexoCore status="idle|listening|thinking|speaking" />.

const TAU = Math.PI * 2;
const ICE = '#c0f8ff';
const CYAN = '#59d6ff';
const BLUE = '#2388d5';
const TEAL = '#67e4e7';

function randomGenerator(seed = 92383) {
  return () => {
    let x = (seed += 0x6d2b79f5);
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function xyz(lat, lon, radius) {
  return [
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    radius * Math.cos(lat) * Math.sin(lon),
  ];
}

function layer() {
  return { vertices: [], colors: [] };
}

function trace(target, points, hex, intensity = 1) {
  const color = new THREE.Color(hex);
  const last = points.length - 1;
  if (last < 1) return;

  for (let j = 0; j < last; j++) {
    const a = j / last;
    const b = (j + 1) / last;
    const start = (0.2 + 0.8 * Math.pow(Math.sin(Math.PI * a), 0.7)) * intensity;
    const end = (0.2 + 0.8 * Math.pow(Math.sin(Math.PI * b), 0.7)) * intensity;
    target.vertices.push(...points[j], ...points[j + 1]);
    target.colors.push(
      color.r * start, color.g * start, color.b * start,
      color.r * end, color.g * end, color.b * end
    );
  }
}

function sphericalArc(lat, start, span, radius, num = 36) {
  const points = [];
  for (let i = 0; i <= num; i++) {
    const t = i / num;
    points.push(xyz(lat, start + span * t, radius));
  }
  return points;
}

function meridianArc(lon, start, span, radius, num = 36) {
  const points = [];
  for (let i = 0; i <= num; i++) {
    points.push(xyz(start + span * (i / num), lon, radius));
  }
  return points;
}

// Um caminho técnico segue a curvatura da esfera com mudanças de direção,
// como trilhas de dados. Curvas suaves evitam as quinas do modelo antigo.
function circuitTrace(lat, lon, radius, rng) {
  const points = [xyz(lat, lon, radius)];
  const steps = 2 + Math.floor(rng() * 4);
  let a = lat;
  let b = lon;
  const signA = rng() > 0.5 ? 1 : -1;
  const signB = rng() > 0.5 ? 1 : -1;
  for (let j = 0; j < steps; j++) {
    const isParallel = j % 3 !== 1;
    const distance = 0.045 + rng() * (isParallel ? 0.22 : 0.075);
    const originalA = a;
    const originalB = b;
    if (isParallel) b += distance * signB;
    else a = THREE.MathUtils.clamp(a + distance * signA, -1.45, 1.45);
    for (let n = 1; n <= 9; n++) {
      const s = n / 9;
      points.push(xyz(
        THREE.MathUtils.lerp(originalA, a, s),
        THREE.MathUtils.lerp(originalB, b, s),
        radius
      ));
    }
  }
  return points;
}

function makeOrbitalArc(radius, start, span, tiltX, tiltY) {
  const rotation = new THREE.Euler(tiltX, tiltY, 0);
  const points = [];
  for (let i = 0; i <= 70; i++) {
    const a = start + span * (i / 70);
    const vec = new THREE.Vector3(radius * Math.cos(a), radius * Math.sin(a), 0);
    vec.applyEuler(rotation);
    points.push(vec.toArray());
  }
  return points;
}

// N.E.X.O. / NEBULA CORE 06.2
// Fragmentos filamentosos e curvas irregulares em 3D, sem casca sólida.
// Ajustes rápidos: aumentar DETAIL.density (até ~1.4 em PCs bons)
// ou reduzir DETAIL.glow caso fique brilhante demais.
const DETAIL = {
  density: 0.52,
  glow: 0.15,
  straightTraces: 44,  // trilhas lineares curtas; 0 desativa
  orbitSpeed: .90,     // velocidade das órbitas independentes     // inclinação das órbitas independentes no eixo Y
};

// Ruído suave determinístico: curvas sinuosas, nunca zigue-zagues aleatórios.
function ripple(t, phase) {
  return (
    Math.sin(t * 100.3 + phase) * 0.10 +
    Math.sin(t * 20.1 + phase * 1.03) * 0.14 +
    Math.sin(t * 300.8 + phase * 1.11) * 0.08
  );
}

// Trilhas de latitude deformadas, com extremidades irregulares e pequenos
// desvios tridimensionais que continuam suavemente de um ponto ao seguinte.
function plasmaArc(lat, lon, span, radius, phase, amplitude, count = 36) {
  const points = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const a = lat + amplitude * ripple(t, phase + 100.7) * Math.sin(Math.PI * t);
    const b = lon + span * t + amplitude * 10.4 * ripple(t, phase + 41.9);
    const r = radius + amplitude * 10.45 * ripple(t, phase + 800.2);
    points.push(xyz(a, b, r));
  }
  return points;
}

// Linha livre que serpenteia pela superfície sem ser paralela ou meridiana.
// A amplitude aumenta no meio e reduz nas pontas para parecer uma descarga de luz.
function wildFilament(lat, lon, radius, rng, lengthFactor = 1) {
  const count = 18 + Math.floor(rng() * 60);
  const phase = rng() * TAU;
  const sign = rng() > .5 ? 1 : -1;
  const span = (0.13 + rng() * 0.94) * lengthFactor;
  const slope = (rng() - .5) * 2.45;
  const twist = (rng() - .5) * 0.95;
  const bend = 0.017 + rng() * 0.075;
  const points = [];
  for (let j = 0; j <= count; j++) {
    const t = j / count;
    const envelope = 0.3 + 0.7 * Math.sin(Math.PI * t);
    const latitude = THREE.MathUtils.clamp(
      lat + slope * span * t + bend * envelope * ripple(t, phase), -1.48, 1.48
    );
    const longitude = lon + sign * span * t + twist * t * t
      + bend * 1.6 * envelope * ripple(t, phase + 2.3);
    const r = radius + bend * 0.55 * envelope * ripple(t, phase + 7);
    points.push(xyz(latitude, longitude, r));
  }
  return points;
}

// Agrupamentos localizados: há manchas intensas, vazios e transições suaves.
// O resultado não segue uma grade uniforme de paralelos/meridianos.
// Trilhas de engenharia: trechos retos com pequenas mudanças de direção.
// Diferentes das descargas orgânicas, mas seguem a forma 3D da esfera.
function straightTechTrace(lat, lon, radius, rng) {
  const vertices = [];
  const segments = 1 + Math.floor(rng() * 3);
  let a = lat;
  let b = lon;
  let r = radius;
  vertices.push(xyz(a, b, r));
  const direction = rng() > 0.5 ? 1 : -1;
  for (let i = 0; i < segments; i++) {
    const nextLat = THREE.MathUtils.clamp(a + (rng() - 0.5) * 0.11, -1.42, 1.42);
    const nextLon = b + direction * (0.06 + rng() * 0.16);
    const nextRadius = r + (rng() - 0.5) * 0.25;
    // Um único segmento de reta no espaço, não um arco interpolado.
    vertices.push(xyz(nextLat, nextLon, nextRadius));
    a = nextLat;
    b = nextLon;
    r = nextRadius;
  }
  return vertices;
}

// Órbitas independentes: arcos interrompidos, levemente inclinados,
// sem uma circunferência sólida ou linha atravessando o centro.
function independentOrbits(seed, radius, count, tilt) {
  const rng = randomGenerator(seed);
  const data = layer();
  for (let i = 0; i < count; i++) {
    const start = rng() * TAU;
    const span = .82 + rng() * .20;
    const path = makeOrbitalArc(radius + (rng() - .5) * .34,
      start, span, tilt + (rng() - .5) * 3.18, (rng() - .5) * 33.45);
    trace(data, path, i % 5 === 0 ? ICE : i % 3 === 0 ? TEAL : CYAN,
      (.26 + rng() * .36) * DETAIL.glow);
  }
  return data;
}

function generateStructure() {
  const rng = randomGenerator(624109);
  const shell = layer();
  const circuitry = layer();
  const highlights = layer();
  const interior = layer();
  const orbitals = layer();
  const straight = layer();
  const sparks = [];
  const sparkColors = [];

  const density = DETAIL.density;
  const clusters = Array.from({ length: 18 }, (_, i) => ({
    lat: (rng() - .5) * 2.65,
    lon: rng() * TAU,
    radius: 1.67 + rng() * .15,
    spread: 0.12 + rng() * .32,
    weight: i % 5 === 0 ? 1.3 : 1,
  }));

  // 1. Silhueta descontínua, com alguns arcos mais longos formando a esfera.
  // Deliberadamente menos regular que a grade anterior.
  for (let i = 0; i < Math.round(155 * density); i++) {
    const lat = (rng() - .5) * 20.75;
    const lon = rng() * TAU;
    const r = 1.72 + rng() * .075;
    const span = .11 + rng() * .78;
    trace(shell,
      plasmaArc(lat, lon, span, r, rng() * 15, .007 + rng() * .025, 34),
      rng() > .82 ? ICE : rng() > .42 ? CYAN : BLUE,
      (.11 + rng() * .31) * DETAIL.glow);
  }

  // 2. Filamentos irregulares por manchas: o grande ganho de densidade.
  // Caminhos ondulados contínuos, sem quinas e com comprimentos variados.
  for (const cluster of clusters) {
    const count = Math.round((45 + rng() * 68) * density * cluster.weight);
    for (let i = 0; i < count; i++) {
      const lat = THREE.MathUtils.clamp(
        cluster.lat + (rng() + rng() + rng() - 1.5) * cluster.spread,
        -1.45, 1.45
      );
      const lon = cluster.lon + (rng() + rng() + rng() - 1.5) * cluster.spread * 2.4;
      const radius = cluster.radius + (rng() - .5) * .13;
      const bright = rng();
      trace(circuitry, wildFilament(lat, lon, radius, rng, .45 + rng() * .9),
        bright > .92 ? ICE : bright > .43 ? CYAN : BLUE,
        (.10 + rng() * .34) * DETAIL.glow);
    }
  }

  // 3. Filamentos soltos que cruzam camadas (sem formar um novelo uniforme).
  for (let i = 0; i < Math.round(330 * density); i++) {
    const lat = (rng() - .5) * 2.65;
    const lon = rng() * TAU;
    const radius = 1.15 + rng() * .95;
    trace(interior, wildFilament(lat, lon, radius, rng, .25 + rng() * 1.1),
      rng() > .82 ? TEAL : BLUE, (.08 + rng() * .24) * DETAIL.glow);
  }

  // 4. Trilhas de energia mais brilhantes, raras e curtas; criam hierarquia.
  for (let i = 0; i < Math.round(100* density); i++) {
    const cluster = clusters[Math.floor(rng() * clusters.length)];
    const lat = THREE.MathUtils.clamp(cluster.lat + (rng() - .5) * .45, -1.45, 1.45);
    const lon = cluster.lon + (rng() - .5) * .8;
    trace(highlights,
      wildFilament(lat, lon, 1.76 + rng() * .07, rng, .24 + rng() * .58),
      rng() > .48 ? ICE : TEAL,
      (.20 + rng() * .56) * DETAIL.glow);
  }

  // 5. Órbitas incompletas de larguras diferentes, algumas suaves e outras
  // perturbadas. Elas dão forma ao holograma sem cercá-lo em arame.
  for (let axis = 0; axis < 7; axis++) {
    const radius = 1.54 + axis * .048;
    const tiltX = .22 + axis * .41;
    const tiltY = axis * .87;
    const pieces = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < pieces; i++) {
      const begin = (i / pieces) * TAU + axis * .29;
      const span = .22 + rng() * .72;
      const points = makeOrbitalArc(radius, begin, span, tiltX, tiltY);
      trace(orbitals, points, axis % 3 === 0 ? ICE : CYAN,
        (axis % 3 === 0 ? .18 : .09 + rng() * .16) * DETAIL.glow);
    }
  }

  // 5b. Alguns segmentos retos para contrastar com os filamentos sinuosos.
  // Poucos, distribuídos em várias profundidades e com brilho moderado.
  for (let i = 0; i < DETAIL.straightTraces; i++) {
    const cluster = clusters[Math.floor(rng() * clusters.length)];
    const lat = THREE.MathUtils.clamp(cluster.lat + (rng() - .5) * .7, -1.42, 1.42);
    const lon = cluster.lon + (rng() - .5) * .8;
    const radius = 1.47 + rng() * .35;
    trace(straight, straightTechTrace(lat, lon, radius, rng),
      rng() > .8 ? ICE : CYAN, (0.22 + rng() * .28) * DETAIL.glow);
  }

  // 6. Núcleo interno: caminhos densos ao redor da fonte central de energia.
  for (let i = 0; i < Math.round(3000 * density); i++) {
    const lat = (rng() - .5) * 2.7;
    const lon = rng() * TAU;
    const radius = .35 + rng() * 1.66;
    trace(interior, wildFilament(lat, lon, radius, rng, .15 + rng() * .64),
      rng() > .63 ? CYAN : BLUE, (.08 + rng() * .28) * DETAIL.glow);
  }

  // 7. Poeira de fótons distribuída preferencialmente perto dos agrupamentos.
  for (let i = 0; i < Math.round(5350 * density); i++) {
    let lat, lon, radius;
    if (rng() < .7) {
      const cluster = clusters[Math.floor(rng() * clusters.length)];
      lat = THREE.MathUtils.clamp(cluster.lat + (rng() + rng() + rng() - 1.5) * .45, -1.49, 1.49);
      lon = cluster.lon + (rng() + rng() + rng() - 1.5) * 3.85;
      radius = cluster.radius + (rng() - .5) * 1.23;
    } else {
      lat = Math.asin(2 * rng() - 1);
      lon = rng() * TAU;
      radius = .28 + Math.pow(rng(), .38) * 1.6;
    }
    sparks.push(...xyz(lat, lon, radius));
    const c = new THREE.Color(i % 11 === 0 ? ICE : i % 4 === 0 ? TEAL : CYAN);
    const factor = .16 + rng() * .6;
    sparkColors.push(c.r * factor, c.g * factor, c.b * factor);
  }

  return {
    skeleton: shell, circuitry, highlights, interior, orbitals, straight,
    sparks: new Float32Array(sparks),
    sparkColors: new Float32Array(sparkColors)
  };
}

function filamentGeometry(data) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
  return geometry;
}

function Filaments({ data, opacity = 1 }) {
  const geometry = useMemo(() => filamentGeometry(data), [data]);
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial vertexColors transparent opacity={opacity}
        blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

const pointVertex = `
  attribute vec3 color;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 pos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * pos;
    gl_PointSize = clamp(17.0 / max(2.0, -pos.z), 1.1, 3.8);
  }
`;
const pointFragment = `
  varying vec3 vColor;
  void main() {
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float alpha = (1.0 - smoothstep(0.05, 1.0, r)) * 0.75;
    gl_FragColor = vec4(vColor, alpha);
  }
`;
function LightDust({ positions, colors }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [positions, colors]);
  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial vertexShader={pointVertex} fragmentShader={pointFragment}
        transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false}/>
    </points>
  );
}

// Brilho alfa radial em GLSL: transparência real, sem o quadrado branco da V4.
const glowVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const glowFragment = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uPower;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);
    float pulse = 1.96 + 0.04 * sin(uTime * 2.25);
    float haze = 0.14 * exp(-d * d * 6.0);
    float glow = 0.35 * exp(-d * d * 35.0);
    float hot = 0.74 * exp(-d * d * 180.0);
    float alpha = (haze + glow + hot) * pulse * uPower;
    vec3 color = mix(vec3(0.025, 0.32, 0.76), vec3(0.73, 0.96, 1.0), 1.0 - smoothstep(0.0, 0.7, d));
    gl_FragColor = vec4(color, alpha);
  }
`;

function Heart({ status }) {
  const glow = useRef();
  const ring = useRef();
  const loops = useMemo(() => {
    const result = layer();
    for (let i = 0; i < 5; i++) {
      const radius = 0.22 + i * 0.09;
      const tiltX = 0.25 + i * 0.29;
      const tiltY = i * 0.41;
      const start = i * 0.73;
      const span = i % 2 === 0 ? 4.4 : 3.2;
      trace(result, makeOrbitalArc(radius, start, span, tiltX, tiltY),
        i % 2 ? CYAN : ICE, 0.3 + i * 0.09);
    }
    return result;
  }, []);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const power = status === 'thinking' ? 1.65 : status === 'listening' ? 1.35 : status === 'speaking' ? 1.55 : 1;
    if (glow.current) {
      glow.current.uniforms.uTime.value = t;
      glow.current.uniforms.uPower.value = THREE.MathUtils.damp(glow.current.uniforms.uPower.value, power, 2.8, delta);
    }
    if (ring.current) {
      ring.current.rotation.y += delta * (status === 'thinking' ? 0.48 : 0.09);
      ring.current.rotation.z -= delta * 0.055;
    }
  });
  return (
    <group>
      <mesh renderOrder={2}>
        <planeGeometry args={[2.35, 2.35]} />
        <shaderMaterial ref={glow} vertexShader={glowVertex} fragmentShader={glowFragment}
          uniforms={{ uTime: { value: 0 }, uPower: { value: 1 } }}
          transparent depthWrite={false} depthTest={false}
          blending={THREE.AdditiveBlending} toneMapped={false}/>
      </mesh>
      <group ref={ring}><Filaments data={loops} opacity={0.85}/></group>
    </group>
  );
}

function CoreScene({ status }) {
  const data = useMemo(generateStructure, []);
  const shell = useRef();
  const circuits = useRef();
  const inner = useRef();
  const orbits = useRef();
  const independentA = useRef();
  const independentB = useRef();
  const dust = useRef();
  const ringA = useMemo(() => independentOrbits(1749, 1.97, 19, 0.38), []);
  const ringB = useMemo(() => independentOrbits(2718, 2.08, 14, 1.05), []);

  useFrame(({ clock, pointer }, delta) => {
    const speed = status === 'thinking' ? 0.18 : status === 'listening' ? 0.10 : 0.15;
    if (shell.current) {
      shell.current.rotation.y += delta * speed;
      shell.current.rotation.x = THREE.MathUtils.damp(shell.current.rotation.x, 0.11 + pointer.y * 0.055, 1.5, delta);
      shell.current.rotation.z = THREE.MathUtils.damp(shell.current.rotation.z, -0.08 - pointer.x * 0.055, 1.5, delta);
      const pulseSpeed =
        status === 'thinking' ? 3.0 :
        status === 'speaking' ? 2.4 :
        status === 'listening' ? 1.8 :
        1.2;

      const pulseAmplitude =
        status === 'thinking' ? 0.018 :
        status === 'speaking' ? .22 :
        status === 'listening' ? .12 :
        0.006;

      const baseScale = status === 'listening' ? 1.04 : 1;

      const target =
        baseScale +
        Math.sin(clock.elapsedTime * pulseSpeed) * pulseAmplitude;
      shell.current.scale.setScalar(THREE.MathUtils.damp(shell.current.scale.x, target, 2.5, delta));
    }
    if (circuits.current) circuits.current.rotation.y -= delta * speed * 1.47;
    if (inner.current) inner.current.rotation.x -= delta * speed * 2.4;
    if (orbits.current) orbits.current.rotation.z += delta * speed * 8.5;
    // Não estão dentro de shell: as órbitas têm rotação própria, com eixos
    // e sentidos diferentes, mesmo no estado de repouso.
    const orbitalFactor = (status === 'thinking' ? 1.7 : status === 'speaking' ? 1.35 : 1) * DETAIL.orbitSpeed;
    if (independentA.current) {
      independentA.current.rotation.y += delta * 0.17 * orbitalFactor;
      independentA.current.rotation.z += delta * 0.045 * orbitalFactor;
    }
    if (independentB.current) {
      independentB.current.rotation.x -= delta * 0.12 * orbitalFactor;
      independentB.current.rotation.y -= delta * 0.065 * orbitalFactor;
    }
    if (dust.current) dust.current.rotation.y += delta * 0.018;
  });

  return (
    <group rotation={[.06, 0.22, 0]}>
      <group ref={shell}>
        <Filaments data={data.skeleton} opacity={0.92} />
        <Filaments data={data.highlights} opacity={0.88} />
        <Filaments data={data.straight} opacity={0.78} />
      </group>
      <group ref={circuits}>
        <Filaments data={data.circuitry} opacity={0.71} />
      </group>
      <group ref={inner}>
        <Filaments data={data.interior} opacity={0.43} />
      </group>
      <group ref={orbits}>
        <Filaments data={data.orbitals} opacity={.66} />
      </group>
      <group ref={independentA} rotation={[0.25, 0.3, 0.18]}>
        <Filaments data={ringA} opacity={0.82} />
      </group>
      <group ref={independentB} rotation={[1.0, -0.35, 0.65]}>
        <Filaments data={ringB} opacity={0.7} />
      </group>
      <group ref={dust}>
        <LightDust positions={data.sparks} colors={data.sparkColors} />
      </group>
      <Heart status={status} />
    </group>
  );
}

export default function NexoCore({ status = 'idle' }) {
  return (
    <div className={`nexo-core nexo-core--${status}`} aria-label="Núcleo holográfico tridimensional do N.E.X.O.">
      <div className="core-backlight" />
      <div className="core-guide core-guide--one" />
      <div className="core-guide core-guide--two" />
      <div className="core-crosshair core-crosshair--top" />
      <div className="core-crosshair core-crosshair--bottom" />
      <div className="nexo-core-canvas">
        <Canvas
          dpr={[1, 1.8]}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          camera={{ position: [0, 0, 7.1], fov: 39, near: 0.1, far: 40 }}
          fallback={<div className="core-fallback">WebGL indisponível neste navegador.</div>}
        >
          <CoreScene status={status} />
        </Canvas>
      </div>
      <span className="core-coordinate core-coordinate--left">NEXO</span>
      <span className="core-coordinate core-coordinate--right">CORE • 1.0</span>
    </div>
  );
}
