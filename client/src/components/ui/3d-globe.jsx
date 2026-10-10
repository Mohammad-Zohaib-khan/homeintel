/*
 * 3D globe (adapted from the Aceternity "3d-globe" component for this JavaScript + Vite + React 18 codebase).
 * Changes from the original:
 *  - Textures are self-hosted in /public/globe (CSP 'self'; no third-party requests).
 *  - Markers are keyboard-focusable buttons with text labels instead of remote avatar images.
 *  - Marker visibility updates only when it changes (the original set state every frame per marker).
 *  - Camera can start over a chosen lat/lng; auto-rotation is disabled under prefers-reduced-motion.
 *  - Callers should provide a non-3D alternative for the same information (see CoverageGlobe).
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '../../lib/utils.js';

const DEFAULT_EARTH_TEXTURE = '/globe/earth-blue-marble.jpg';
const DEFAULT_BUMP_TEXTURE = '/globe/earth-topology.jpg';

export function latLngToVector3(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(-(radius * Math.sin(phi) * Math.cos(theta)), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}

function Marker({ marker, radius, onClick, onHover, active }) {
  const invalidate = useThree((st) => st.invalidate);
  const [hovered, setHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const visibleRef = useRef(true);
  const imageGroupRef = useRef(null);
  const { camera } = useThree();
  const surfacePosition = useMemo(() => latLngToVector3(marker.lat, marker.lng, radius * 1.001), [marker.lat, marker.lng, radius]);
  const topPosition = useMemo(() => latLngToVector3(marker.lat, marker.lng, radius * 1.06), [marker.lat, marker.lng, radius]);
  const lineHeight = topPosition.distanceTo(surfacePosition);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!imageGroupRef.current) return;
    imageGroupRef.current.getWorldPosition(tmp);
    const dot = tmp.normalize().dot(camera.position.clone().normalize());
    const vis = dot > 0.15;
    if (vis !== visibleRef.current) { visibleRef.current = vis; setIsVisible(vis); }
  });

  const { lineCenter, lineQuaternion } = useMemo(() => {
    const center = surfacePosition.clone().lerp(topPosition, 0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), topPosition.clone().sub(surfacePosition).normalize());
    return { lineCenter: center, lineQuaternion: q };
  }, [surfacePosition, topPosition]);

  const enter = useCallback(() => { setHovered(true); onHover?.(marker); }, [marker, onHover]);
  const leave = useCallback(() => { setHovered(false); onHover?.(null); }, [onHover]);
  const lit = hovered || active;
  useEffect(() => { invalidate(); }, [lit, invalidate]);

  return (
    <group visible={isVisible}>
      <mesh position={lineCenter} quaternion={lineQuaternion}>
        <cylinderGeometry args={[0.0025, 0.0025, lineHeight, 6]} />
        <meshBasicMaterial color={lit ? '#ffffff' : '#cfe3da'} transparent opacity={lit ? 0.95 : 0.7} />
      </mesh>
      <group ref={imageGroupRef} position={topPosition}>
        <Html center zIndexRange={[20, 0]} style={{ pointerEvents: isVisible ? 'auto' : 'none', opacity: isVisible ? 1 : 0, transition: 'opacity .15s ease-out' }}>
          <button type="button" tabIndex={isVisible ? 0 : -1} aria-hidden={!isVisible}
            onMouseEnter={enter} onMouseLeave={leave} onFocus={enter} onBlur={leave} onClick={() => onClick?.(marker)}
            aria-label={marker.ariaLabel || marker.label}
            className="group relative flex items-center">
            <span className={cn('block rounded-full border-2 border-white shadow-md transition-transform', lit ? 'h-3.5 w-3.5 scale-110' : 'h-2.5 w-2.5')}
              style={{ background: marker.color || 'rgb(var(--accent))' }} />
            <span className={cn('pointer-events-none absolute left-4 whitespace-nowrap rounded-sm bg-[rgb(var(--raised))] px-1.5 py-0.5 text-xs text-[rgb(var(--ink))] shadow-md transition-opacity', lit ? 'opacity-100' : 'opacity-0')}>
              {marker.label}{marker.sublabel ? <span className="ml-1 font-semibold">{marker.sublabel}</span> : null}
            </span>
          </button>
        </Html>
      </group>
    </group>
  );
}

// Orientation that brings (lat, lng) to face the default camera (+z) while keeping north up.
function focusRotation(lat, lng) {
  const v = latLngToVector3(lat, lng, 1);
  const yaw = -Math.atan2(v.x, v.z);                       // swing the longitude round to the front
  const pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));     // then tilt the latitude to the centre
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
  return qx.multiply(qy);
}

function RotatingGlobe({ config, markers, onMarkerClick, onMarkerHover, activeId }) {
  const orientation = useMemo(() => focusRotation(config.focus.lat, config.focus.lng), [config.focus.lat, config.focus.lng]);
  const [earthTexture, bumpTexture] = useTexture([config.textureUrl, config.bumpMapUrl]);
  useMemo(() => {
    if (earthTexture) { earthTexture.colorSpace = THREE.SRGBColorSpace; earthTexture.anisotropy = 8; }
    if (bumpTexture) bumpTexture.anisotropy = 4;
  }, [earthTexture, bumpTexture]);
  const geometry = useMemo(() => new THREE.SphereGeometry(config.radius, 64, 64), [config.radius]);
  return (
    <group quaternion={orientation}>
      <mesh geometry={geometry}>
        <meshStandardMaterial map={earthTexture} bumpMap={bumpTexture} bumpScale={config.bumpScale * 0.05} roughness={0.75} metalness={0} />
      </mesh>
      {markers.map((m) => <Marker key={m.id ?? `${m.lat},${m.lng}`} marker={m} radius={config.radius} onClick={onMarkerClick} onHover={onMarkerHover} active={m.id === activeId} />)}
    </group>
  );
}

function Atmosphere({ radius, color, intensity, blur }) {
  const fresnelPower = Math.max(0.5, 5 - blur);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { atmosphereColor: { value: new THREE.Color(color) }, intensity: { value: intensity }, fresnelPower: { value: fresnelPower } },
    vertexShader: 'varying vec3 vNormal; varying vec3 vPosition; void main(){ vNormal = normalize(normalMatrix * normal); vPosition = (modelViewMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 atmosphereColor; uniform float intensity; uniform float fresnelPower; varying vec3 vNormal; varying vec3 vPosition; void main(){ float f = pow(1.0 - abs(dot(vNormal, normalize(-vPosition))), fresnelPower); gl_FragColor = vec4(atmosphereColor, f * intensity); }',
    side: THREE.BackSide, transparent: true, depthWrite: false,
  }), [color, intensity, fresnelPower]);
  return <mesh scale={[1.12, 1.12, 1.12]}><sphereGeometry args={[radius, 64, 32]} /><primitive object={material} attach="material" /></mesh>;
}

function Scene({ markers, config, onMarkerClick, onMarkerHover, activeId }) {
  return (
    <>
      <ambientLight intensity={config.ambientIntensity} />
      <directionalLight position={[config.radius * 5, config.radius * 2, config.radius * 5]} intensity={config.pointLightIntensity} />
      <directionalLight position={[-config.radius * 3, config.radius, -config.radius * 2]} intensity={config.pointLightIntensity * 0.3} color="#cfe3da" />
      <RotatingGlobe config={config} markers={markers} onMarkerClick={onMarkerClick} onMarkerHover={onMarkerHover} activeId={activeId} />
      {config.showAtmosphere && <Atmosphere radius={config.radius} color={config.atmosphereColor} intensity={config.atmosphereIntensity} blur={config.atmosphereBlur} />}
      <OrbitControls makeDefault enablePan={config.enablePan} enableZoom={config.enableZoom} minDistance={config.minDistance} maxDistance={config.maxDistance}
        rotateSpeed={0.4} autoRotate={config.autoRotateSpeed > 0} autoRotateSpeed={config.autoRotateSpeed} enableDamping dampingFactor={0.1} />
    </>
  );
}

const defaultConfig = {
  radius: 2, textureUrl: DEFAULT_EARTH_TEXTURE, bumpMapUrl: DEFAULT_BUMP_TEXTURE,
  showAtmosphere: true, atmosphereColor: '#9fd6c0', atmosphereIntensity: 0.35, atmosphereBlur: 1.5,
  bumpScale: 1, autoRotateSpeed: 0, enableZoom: true, enablePan: false, minDistance: 4.2, maxDistance: 9,
  cameraDistance: 3.3, focus: { lat: 0, lng: 0 }, ambientIntensity: 0.75, pointLightIntensity: 1.4, backgroundColor: null,
};

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
}

export function Globe3D({ markers = [], config = {}, className, onMarkerClick, onMarkerHover, activeId, label = '3D globe' }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const merged = useMemo(() => ({ ...defaultConfig, ...config, ...(reduced ? { autoRotateSpeed: 0 } : {}) }), [config, reduced]);
  return (
    <div className={cn('relative h-[500px] w-full', className)} role="region" aria-label={label}>
      {/* Render on demand: frames are drawn only when the controls move (or auto-rotate is on), not 60×/s at idle. */}
      <Canvas frameloop={merged.autoRotateSpeed > 0 ? 'always' : 'demand'} gl={{ antialias: true, alpha: true, powerPreference: 'default' }} dpr={[1, 2]}
        camera={{ fov: 45, near: 0.1, far: 1000, position: [0, 0, merged.radius * merged.cameraDistance] }}
        style={{ background: merged.backgroundColor || 'transparent' }}>
        <Suspense fallback={<Html center><span className="text-sm text-[rgb(var(--muted))]">Loading globe…</span></Html>}>
          <Scene markers={markers} config={merged} onMarkerClick={onMarkerClick} onMarkerHover={onMarkerHover} activeId={activeId} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default Globe3D;
