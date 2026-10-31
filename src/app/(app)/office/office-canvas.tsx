"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Line, OrbitControls, PerformanceMonitor, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import type { OfficeAgent, OfficeDepartment } from "./types";

const STATUS_COLOR: Record<string, string> = {
  WORKING: "#fbbf24",
  AVAILABLE: "#34d399",
  ON_BREAK: "#38bdf8",
  OFFLINE: "#52525b",
};

// Shared across every mesh: one material per look instead of one per mesh.
const MAT = {
  wall: new THREE.MeshStandardMaterial({ color: "#101823", roughness: 0.9 }),
  trim: new THREE.MeshStandardMaterial({ color: "#34d399", emissive: "#34d399", emissiveIntensity: 0.45 }),
  glass: new THREE.MeshStandardMaterial({ color: "#0f2433", emissive: "#12384d", emissiveIntensity: 0.55, roughness: 0.2 }),
  frame: new THREE.MeshStandardMaterial({ color: "#1f2b38", roughness: 0.6 }),
  deskTop: new THREE.MeshStandardMaterial({ color: "#5a4535", roughness: 0.55 }),
  metal: new THREE.MeshStandardMaterial({ color: "#1a2430", roughness: 0.5, metalness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: "#151d27", roughness: 0.85 }),
  fabric: new THREE.MeshStandardMaterial({ color: "#243243", roughness: 0.95 }),
  sofa: new THREE.MeshStandardMaterial({ color: "#2b3f55", roughness: 0.95 }),
  pot: new THREE.MeshStandardMaterial({ color: "#d6d3d1", roughness: 0.7 }),
  stem: new THREE.MeshStandardMaterial({ color: "#3f5a3a", roughness: 0.9 }),
  leaf: new THREE.MeshStandardMaterial({ color: "#2f7a55", roughness: 0.85 }),
  leafLight: new THREE.MeshStandardMaterial({ color: "#3f9a68", roughness: 0.85 }),
  mug: new THREE.MeshStandardMaterial({ color: "#e4e4e7", roughness: 0.6 }),
  screenOff: new THREE.MeshStandardMaterial({ color: "#0b1118", emissive: "#0f1720", emissiveIntensity: 0.2, roughness: 0.4 }),
  lamp: new THREE.MeshStandardMaterial({ color: "#fde68a", emissive: "#fbbf24", emissiveIntensity: 1.4 }),
  rug: new THREE.MeshStandardMaterial({ color: "#3a2f4a", roughness: 1 }),
  shadow: new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.35, depthWrite: false }),
};

const SKIN = ["#e9b48c", "#f2c9a8", "#c98e63", "#9a6a48", "#f5d6bd"];

const LOUNGE_POSITION: [number, number, number] = [0, 0, -14.5];
const LOUNGE_CENTER_Z = -14.5;
const LOUNGE_SPOTS: [number, number, number][] = [
  [-4.6, 0, -13.1],
  [-2.4, 0, -13.1],
  [2.4, 0, -13.1],
  [4.6, 0, -13.1],
  [-3.6, 0, -15.4],
  [3.6, 0, -15.4],
  [0, 0, -12.6],
  [0, 0, -16.1],
];

type PlacedAgent = {
  agent: OfficeAgent;
  position: [number, number, number];
};

type Zone = {
  department: OfficeDepartment;
  position: [number, number, number];
};

type Target = {
  position: [number, number, number];
  facing: number;
};

function agentOffsets(count: number): [number, number][] {
  if (count <= 1) return [[0, 0]];
  if (count === 2) return [[-1.9, 0], [1.9, 0]];
  if (count === 3) return [[-2.1, -0.9], [2.1, -0.9], [0, 1.2]];
  if (count === 4) return [[-2.1, -1.1], [2.1, -1.1], [-2.1, 1.1], [2.1, 1.1]];
  return [[-2.2, -1.2], [0, -1.2], [2.2, -1.2], [-2.2, 1.2], [0, 1.2], [2.2, 1.2]];
}

function useSceneLayout(agents: OfficeAgent[], departments: OfficeDepartment[]) {
  return useMemo(() => {
    const cols = Math.min(3, Math.max(1, departments.length));
    const rows = Math.max(1, Math.ceil(departments.length / cols));

    const zones: Zone[] = departments.map((department, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        department,
        position: [(col - (cols - 1) / 2) * 10.6, 0, (row - (rows - 1) / 2) * 13.6],
      };
    });

    const zoneById = new Map(zones.map((zone) => [zone.department.id, zone]));
    const totals = new Map<string, number>();
    for (const agent of agents) {
      totals.set(agent.department.id, (totals.get(agent.department.id) ?? 0) + 1);
    }
    const seen = new Map<string, number>();

    const placed: PlacedAgent[] = agents.map((agent) => {
      const zone = zoneById.get(agent.department.id);
      const base = zone?.position ?? [0, 0, 0];
      const index = seen.get(agent.department.id) ?? 0;
      seen.set(agent.department.id, index + 1);
      const total = totals.get(agent.department.id) ?? 1;
      const offsets = agentOffsets(total);
      const offset = offsets[index % offsets.length] ?? [0, 0];

      return {
        agent,
        position: [base[0] + offset[0], 0, base[2] + offset[1]],
      };
    });

    return { zones, placed };
  }, [agents, departments]);
}

export function OfficeCanvas({
  agents,
  departments,
  selectedId,
  onSelect,
}: {
  agents: OfficeAgent[];
  departments: OfficeDepartment[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { zones, placed } = useSceneLayout(agents, departments);
  const [dpr, setDpr] = useState(1.25);

  return (
    <Canvas
      dpr={dpr}
      camera={{ position: [0, 17, 24], fov: 48 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => onSelect(null)}
    >
      <PerformanceMonitor onDecline={() => setDpr(0.85)} onIncline={() => setDpr(1.25)} flipflops={3} />
      <color attach="background" args={["#05070a"]} />
      <fog attach="fog" args={["#05070a", 24, 50]} />

      {/* No point lights: they cost per pixel on every mesh. Accents are emissive instead. */}
      <hemisphereLight args={["#9fb4cc", "#0b1016", 1.1]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 18, 9]} intensity={1.6} color="#fff4e0" />
      <directionalLight position={[-12, 10, -6]} intensity={0.5} color="#7dd3fc" />

      <Floor />
      <Sparkles count={36} scale={[44, 7, 32]} position={[0, 3.5, -2]} size={2.2} speed={0.25} opacity={0.35} color="#6ee7b7" />

      <SceneContent
        zones={zones}
        placed={placed}
        selectedId={selectedId}
        onSelect={onSelect}
      />

      <OrbitControls
        makeDefault
        target={[0, 0, -1]}
        enablePan={false}
        minDistance={12}
        maxDistance={40}
        minPolarAngle={0.35}
        maxPolarAngle={1.32}
      />
    </Canvas>
  );
}

function SceneContent({
  zones,
  placed,
  selectedId,
  onSelect,
}: {
  zones: Zone[];
  placed: PlacedAgent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { size } = useThree();
  const aspect = size.width / Math.max(1, size.height);
  const scale = aspect >= 1.1 ? 1 : aspect >= 0.9 ? 0.8 : 0.6;
  const labelScale = 1 / scale;

  const { targets, meetingActive } = useMemo(() => {
    const groups = new Map<string, PlacedAgent[]>();
    for (const entry of placed) {
      if (entry.agent.status !== "WORKING" || !entry.agent.currentTaskId) continue;
      const list = groups.get(entry.agent.currentTaskId) ?? [];
      list.push(entry);
      groups.set(entry.agent.currentTaskId, list);
    }

    const meetingTargets = new Map<string, Target>();
    let active = false;
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      active = true;
      group.forEach((entry, index) => {
        const angle = -Math.PI / 2 + (index / group.length) * Math.PI * 2;
        const x = Math.cos(angle) * 3.2;
        const z = Math.sin(angle) * 3.2;
        meetingTargets.set(entry.agent.id, {
          position: [x, 0, z],
          facing: Math.atan2(-x, -z),
        });
      });
    }

    const map = new Map<string, Target>();
    const resting = placed.filter(
      (entry) => entry.agent.status === "AVAILABLE" || entry.agent.status === "ON_BREAK",
    );
    const restingIndex = new Map(resting.map((entry, index) => [entry.agent.id, index]));

    placed.forEach((entry) => {
      const meeting = meetingTargets.get(entry.agent.id);
      if (meeting) {
        map.set(entry.agent.id, meeting);
        return;
      }

      const restIndex = restingIndex.get(entry.agent.id);
      if (restIndex !== undefined) {
        const spot =
          LOUNGE_SPOTS[restIndex] ??
          ([
            -6 + (restIndex % 6) * 2.4,
            0,
            -17 - Math.floor(restIndex / 6) * 2,
          ] as [number, number, number]);

        map.set(entry.agent.id, {
          position: spot,
          facing: Math.atan2(-spot[0], LOUNGE_CENTER_Z - spot[2]),
        });
        return;
      }

      map.set(entry.agent.id, { position: entry.position, facing: 0 });
    });

    return { targets: map, meetingActive: active };
  }, [placed]);

  return (
    <group scale={scale}>
      <Walls labelScale={labelScale} />

      {zones.map((zone) => (
        <DepartmentZone key={zone.department.id} zone={zone} />
      ))}

      {placed.map((entry) => (
        <DeskStation
          key={`desk-${entry.agent.id}`}
          position={entry.position}
          color={entry.agent.department.color}
          working={entry.agent.status === "WORKING"}
        />
      ))}

      <MeetingTable active={meetingActive} labelScale={labelScale} />
      <Lounge labelScale={labelScale} />
      <CoffeeBar />
      <Bookshelves />
      <StatusScreen
        working={placed.filter((entry) => entry.agent.status === "WORKING").length}
        total={placed.length}
        labelScale={labelScale}
      />
      <Plants />

      {placed.map((entry, index) => {
        const target = targets.get(entry.agent.id) ?? { position: entry.position, facing: 0 };
        return (
          <WalkingAvatar
            key={entry.agent.id}
            agent={entry.agent}
            home={entry.position}
            target={target}
            index={index}
            selected={selectedId === entry.agent.id}
            onSelect={onSelect}
            labelScale={labelScale}
          />
        );
      })}
    </group>
  );
}

function Walls({ labelScale }: { labelScale: number }) {
  const windowPositions = [-15, -10, -5, 0, 5, 10, 15];

  return (
    <group>
      <mesh position={[0, 2.5, -21]} material={MAT.wall}>
        <boxGeometry args={[42, 5, 0.4]} />
      </mesh>
      <mesh position={[0, 5.05, -21]} material={MAT.trim}>
        <boxGeometry args={[42, 0.14, 0.5]} />
      </mesh>

      {windowPositions.map((x) => (
        <group key={x}>
          <mesh position={[x, 2.75, -20.76]} material={MAT.glass}>
            <planeGeometry args={[3.7, 2.3]} />
          </mesh>
          <mesh position={[x + 2, 2.75, -20.72]} material={MAT.frame}>
            <boxGeometry args={[0.08, 2.5, 0.08]} />
          </mesh>
        </group>
      ))}

      {[-20.5, 20.5].map((x) => (
        <group key={x}>
          <mesh position={[x, 2.5, 0]} material={MAT.wall}>
            <boxGeometry args={[0.4, 5, 42]} />
          </mesh>
          <mesh position={[x, 5.05, 0]} material={MAT.trim}>
            <boxGeometry args={[0.5, 0.14, 42]} />
          </mesh>
          {[-9, 9].map((z) => (
            <mesh key={z} position={[x - Math.sign(x) * 0.23, 2.7, z]} rotation-y={-Math.sign(x) * Math.PI / 2} material={MAT.glass}>
              <planeGeometry args={[5.5, 2.2]} />
            </mesh>
          ))}
        </group>
      ))}

      <TextSprite
        text="AI VIRTUAL OFFICE"
        position={[0, 4.15, -20.76]}
        height={0.72 * labelScale}
        color="#6ee7b7"
      />
    </group>
  );
}

function Floor() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[66, 50]} />
        <meshStandardMaterial color="#121a24" roughness={0.6} metalness={0.25} />
      </mesh>
      <gridHelper args={[66, 33, "#1f2a36", "#18212b"]} position={[0, 0.01, 0]} />
    </group>
  );
}

function DepartmentZone({ zone }: { zone: Zone }) {
  return (
    <group position={zone.position}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <planeGeometry args={[9.4, 6.4]} />
        <meshBasicMaterial color={zone.department.color} transparent opacity={0.085} />
      </mesh>
      <Line
        points={[[-4.7, 0.03, -3.2], [4.7, 0.03, -3.2], [4.7, 0.03, 3.2], [-4.7, 0.03, 3.2], [-4.7, 0.03, -3.2]]}
        color={zone.department.color}
        lineWidth={1.5}
        transparent
        opacity={0.45}
      />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.05, 0.08, 24]} />
        <meshBasicMaterial color={zone.department.color} transparent opacity={0.65} />
      </mesh>
    </group>
  );
}

function DeskStation({
  position,
  color,
  working,
}: {
  position: [number, number, number];
  color: string;
  working: boolean;
}) {
  return (
    <group position={position}>
      <Desk color={color} working={working} />
    </group>
  );
}

// Static fake shadow: the real ones (ContactShadows) re-render the scene every frame.
function BlobShadow({ radius, position = [0, 0.03, 0] }: { radius: number; position?: [number, number, number] }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={position} material={MAT.shadow}>
      <circleGeometry args={[radius, 20]} />
    </mesh>
  );
}

function Desk({ color, working }: { color: string; working: boolean }) {
  return (
    <group>
      <BlobShadow radius={0.95} position={[0, 0.03, 0.7]} />
      <mesh position={[0, 0.56, 0.85]} material={MAT.deskTop}>
        <boxGeometry args={[1.6, 0.08, 0.85]} />
      </mesh>
      {[-0.7, 0.7].map((x) =>
        [-0.3, 0.3].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.28, 0.85 + z]} material={MAT.metal}>
            <boxGeometry args={[0.07, 0.56, 0.07]} />
          </mesh>
        )),
      )}

      <mesh position={[0, 0.68, 1.05]} material={MAT.metal}>
        <boxGeometry args={[0.08, 0.2, 0.08]} />
      </mesh>
      <mesh position={[0, 0.52, 0.425]}>
        <boxGeometry args={[1.6, 0.03, 0.02]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={working ? 0.9 : 0.25} />
      </mesh>
      <mesh position={[0, 0.93, 1.1]} material={MAT.metal}>
        <boxGeometry args={[0.84, 0.52, 0.03]} />
      </mesh>
      <mesh position={[0.6, 0.65, 0.95]} material={MAT.mug}>
        <cylinderGeometry args={[0.05, 0.045, 0.1, 10]} />
      </mesh>
      <mesh position={[-0.62, 0.66, 1.05]} material={MAT.pot}>
        <cylinderGeometry args={[0.07, 0.06, 0.12, 10]} />
      </mesh>
      <mesh position={[-0.62, 0.8, 1.05]} material={MAT.leafLight}>
        <icosahedronGeometry args={[0.11, 0]} />
      </mesh>
      <mesh position={[0, 0.93, 1.08]}>
        <boxGeometry args={[0.78, 0.46, 0.04]} />
        <meshStandardMaterial
          color="#0b1118"
          emissive={working ? color : "#0f1720"}
          emissiveIntensity={working ? 0.85 : 0.14}
          roughness={0.5}
        />
      </mesh>
      <mesh position={[0, 0.61, 0.72]} material={MAT.dark}>
        <boxGeometry args={[0.52, 0.02, 0.16]} />
      </mesh>

      <mesh position={[0, 0.38, 0.45]} material={MAT.fabric}>
        <cylinderGeometry args={[0.26, 0.26, 0.07, 14]} />
      </mesh>
      <mesh position={[0, 0.66, 0.62]} material={MAT.fabric}>
        <boxGeometry args={[0.42, 0.5, 0.07]} />
      </mesh>
    </group>
  );
}

function WalkingAvatar({
  agent,
  home,
  target,
  index,
  selected,
  onSelect,
  labelScale,
}: {
  agent: OfficeAgent;
  home: [number, number, number];
  target: Target;
  index: number;
  selected: boolean;
  onSelect: (id: string | null) => void;
  labelScale: number;
}) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legLeft = useRef<THREE.Group>(null);
  const legRight = useRef<THREE.Group>(null);
  const armLeft = useRef<THREE.Group>(null);
  const armRight = useRef<THREE.Group>(null);

  const current = useRef(new THREE.Vector3(home[0], 0, home[2]));
  const rotation = useRef(0);
  const phase = useRef(0);
  const targetRef = useRef(target);
  targetRef.current = target;

  const skin = SKIN[index % SKIN.length] ?? "#e9b48c";
  const statusColor = STATUS_COLOR[agent.status] ?? "#52525b";
  const working = agent.status === "WORKING";
  const atMeeting = target.position[0] !== home[0] || target.position[2] !== home[2];

  useFrame((state, delta) => {
    if (!group.current) return;
    const dt = Math.min(delta, 0.05);
    const destination = targetRef.current.position;
    const dx = destination[0] - current.current.x;
    const dz = destination[2] - current.current.z;
    const distance = Math.hypot(dx, dz);
    const walking = distance > 0.1;

    if (walking) {
      const speed = 2.6;
      const step = Math.min(speed * dt, distance);
      current.current.x += (dx / distance) * step;
      current.current.z += (dz / distance) * step;

      const desired = Math.atan2(dx, dz);
      rotation.current = dampAngle(rotation.current, desired, 10, dt);
      phase.current += dt * 9;
    } else {
      rotation.current = dampAngle(rotation.current, targetRef.current.facing, 6, dt);
      phase.current = 0;
    }

    group.current.position.set(current.current.x, walking ? Math.abs(Math.sin(phase.current)) * 0.03 : 0, current.current.z);
    group.current.rotation.y = rotation.current;

    const swing = walking ? Math.sin(phase.current) * 0.65 : 0;
    if (legLeft.current) legLeft.current.rotation.x = swing;
    if (legRight.current) legRight.current.rotation.x = -swing;

    if (armLeft.current && armRight.current) {
      if (walking) {
        armLeft.current.rotation.x = -swing * 0.8;
        armRight.current.rotation.x = swing * 0.8;
      } else if (working) {
        const base = atMeeting ? -0.35 : -0.75;
        const amplitude = atMeeting ? 0.25 : 0.12;
        armLeft.current.rotation.x = base + Math.sin(state.clock.elapsedTime * 7 + index) * amplitude;
        armRight.current.rotation.x = base + Math.cos(state.clock.elapsedTime * 7 + index) * amplitude;
      } else {
        armLeft.current.rotation.x = dampValue(armLeft.current.rotation.x, 0, 5, dt);
        armRight.current.rotation.x = dampValue(armRight.current.rotation.x, 0, 5, dt);
      }
    }

    if (body.current) {
      body.current.position.y = walking
        ? Math.abs(Math.sin(phase.current)) * 0.035
        : working
          ? Math.sin(state.clock.elapsedTime * 2 + index) * 0.012
          : Math.sin(state.clock.elapsedTime * 0.9 + index) * 0.008;
    }
  });

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect(agent.id);
  }

  return (
    <group ref={group} position={[home[0], 0, home[2]]} scale={1.12} onClick={handleClick}>
      <BlobShadow radius={0.34} />
      <group ref={body}>
        <mesh position={[0, 0.8, 0]}>
          <capsuleGeometry args={[0.24, 0.44, 4, 10]} />
          <meshStandardMaterial color={agent.department.color} roughness={0.65} />
        </mesh>

        <mesh position={[0, 1.32, 0]}>
          <sphereGeometry args={[0.2, 14, 12]} />
          <meshStandardMaterial color={skin} roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.4, -0.02]} scale={[1, 0.55, 1]}>
          <sphereGeometry args={[0.205, 12, 10]} />
          <meshStandardMaterial color="#1f2937" roughness={0.9} />
        </mesh>

        <group ref={legLeft} position={[-0.12, 0.44, 0]}>
          <mesh position={[0, -0.22, 0]}>
            <boxGeometry args={[0.13, 0.44, 0.14]} />
            <meshStandardMaterial color="#161d26" roughness={0.9} />
          </mesh>
        </group>
        <group ref={legRight} position={[0.12, 0.44, 0]}>
          <mesh position={[0, -0.22, 0]}>
            <boxGeometry args={[0.13, 0.44, 0.14]} />
            <meshStandardMaterial color="#161d26" roughness={0.9} />
          </mesh>
        </group>

        <group ref={armLeft} position={[-0.3, 1.02, 0]}>
          <mesh position={[0, -0.23, 0]}>
            <boxGeometry args={[0.1, 0.46, 0.12]} />
            <meshStandardMaterial color={agent.department.color} roughness={0.7} />
          </mesh>
        </group>
        <group ref={armRight} position={[0.3, 1.02, 0]}>
          <mesh position={[0, -0.23, 0]}>
            <boxGeometry args={[0.1, 0.46, 0.12]} />
            <meshStandardMaterial color={agent.department.color} roughness={0.7} />
          </mesh>
        </group>

        <mesh position={[0, 1.58, 0]}>
          <sphereGeometry args={[0.045, 10, 10]} />
          <meshBasicMaterial color={statusColor} />
        </mesh>

        <TextSprite
          text={agent.name.split(" ")[0] ?? agent.name}
          position={[0, 1.82, 0]}
          height={0.55 * labelScale}
          color="#e4e4e7"
        />
      </group>

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.035, 0]}>
        <ringGeometry args={[0.34, 0.4, 32]} />
        <meshBasicMaterial color={statusColor} transparent opacity={working ? 0.8 : 0.45} />
      </mesh>
      {selected ? (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.46, 0.54, 40]} />
          <meshBasicMaterial color="#34d399" transparent opacity={0.9} />
        </mesh>
      ) : null}
    </group>
  );
}

function MeetingTable({ active, labelScale }: { active: boolean; labelScale: number }) {
  return (
    <group position={[0, 0, 0]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0]}>
        <planeGeometry args={[9, 7]} />
        <meshBasicMaterial color="#0b1118" transparent opacity={0.65} />
      </mesh>

      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[2.2, 2.2, 0.12, 40]} />
        <meshStandardMaterial
          color="#4a3a2d"
          emissive={active ? "#fbbf24" : "#000000"}
          emissiveIntensity={active ? 0.08 : 0}
          roughness={0.55}
        />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.32, 0.4, 0.72, 16]} />
        <meshStandardMaterial color="#111820" />
      </mesh>

      {Array.from({ length: 8 }).map((_, index) => {
        const angle = -Math.PI / 2 + (index / 8) * Math.PI * 2;
        const x = Math.cos(angle) * 2.9;
        const z = Math.sin(angle) * 2.9;
        return (
          <group key={index} position={[x, 0, z]} rotation-y={Math.atan2(-x, -z)}>
            <mesh position={[0, 0.3, 0]} material={MAT.fabric}>
              <boxGeometry args={[0.48, 0.08, 0.48]} />
            </mesh>
            <mesh position={[0, 0.56, 0.22]} material={MAT.fabric}>
              <boxGeometry args={[0.48, 0.44, 0.07]} />
            </mesh>
          </group>
        );
      })}

      {active ? (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.9, 0]}>
          <ringGeometry args={[2.35, 2.48, 48]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.28} />
        </mesh>
      ) : null}

      <TextSprite
        text={active ? "Reunión en curso" : "Sala de reuniones"}
        position={[0, 2.5, 0]}
        height={0.55 * labelScale}
        color={active ? "#fbbf24" : "#a1a1aa"}
      />
    </group>
  );
}

function Lounge({ labelScale }: { labelScale: number }) {
  return (
    <group position={LOUNGE_POSITION}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0]}>
        <planeGeometry args={[11, 6]} />
        <meshBasicMaterial color="#0c131a" transparent opacity={0.75} />
      </mesh>

      {[-3.6, 3.6].map((x) => (
        <group key={x} position={[x, 0, 0.8]}>
          <mesh position={[0, 0.32, 0]} material={MAT.sofa}>
            <boxGeometry args={[2.2, 0.4, 1]} />
          </mesh>
          <mesh position={[0, 0.72, 0.42]} material={MAT.sofa}>
            <boxGeometry args={[2.2, 0.7, 0.14]} />
          </mesh>
          {[-1.15, 1.15].map((arm) => (
            <mesh key={arm} position={[arm, 0.5, 0.05]} material={MAT.sofa}>
              <boxGeometry args={[0.16, 0.5, 0.9]} />
            </mesh>
          ))}
        </group>
      ))}

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} material={MAT.rug}>
        <circleGeometry args={[2.8, 32]} />
      </mesh>
      <mesh position={[0, 0.32, -0.2]} material={MAT.deskTop}>
        <cylinderGeometry args={[0.75, 0.75, 0.06, 24]} />
      </mesh>
      <mesh position={[0, 0.18, -0.2]} material={MAT.metal}>
        <cylinderGeometry args={[0.18, 0.24, 0.36, 12]} />
      </mesh>
      {[-5.2, 5.2].map((x) => (
        <group key={x} position={[x, 0, 0.6]}>
          <mesh position={[0, 0.8, 0]} material={MAT.metal}>
            <cylinderGeometry args={[0.03, 0.03, 1.6, 6]} />
          </mesh>
          <mesh position={[0, 1.65, 0]} material={MAT.lamp}>
            <coneGeometry args={[0.28, 0.32, 14, 1, true]} />
          </mesh>
        </group>
      ))}

      <TextSprite text="Descanso" position={[0, 1.5, 0]} height={0.65 * labelScale} color="#a1a1aa" />
    </group>
  );
}

function Plants() {
  const spots: [number, number][] = [
    [-17, -12],
    [17, -12],
    [-17, 12],
    [17, 12],
    [-17, 0],
    [17, 0],
  ];

  return (
    <group>
      {spots.map(([x, z], index) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 0.28, 0]} material={MAT.pot}>
            <cylinderGeometry args={[0.34, 0.44, 0.56, 12]} />
          </mesh>
          <mesh position={[0, 0.9, 0]} material={MAT.stem}>
            <cylinderGeometry args={[0.06, 0.08, 0.8, 6]} />
          </mesh>
          <mesh position={[0, 1.35, 0]} material={MAT.leaf}>
            <icosahedronGeometry args={[0.52 + (index % 3) * 0.06, 1]} />
          </mesh>
          <mesh position={[0.18, 1.75, 0.1]} material={MAT.leafLight}>
            <icosahedronGeometry args={[0.32, 1]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CoffeeBar() {
  return (
    <group position={[-8.5, 0, -19.6]}>
      <mesh position={[0, 0.5, 0]} material={MAT.dark}>
        <boxGeometry args={[3.2, 1, 0.8]} />
      </mesh>
      <mesh position={[0, 1.03, 0]} material={MAT.deskTop}>
        <boxGeometry args={[3.3, 0.06, 0.9]} />
      </mesh>
      <mesh position={[-0.9, 1.36, -0.1]} material={MAT.metal}>
        <boxGeometry args={[0.5, 0.6, 0.45]} />
      </mesh>
      <mesh position={[-0.9, 1.5, 0.13]} material={MAT.trim}>
        <boxGeometry args={[0.2, 0.06, 0.02]} />
      </mesh>
      {[0.1, 0.35, 0.6].map((x) => (
        <mesh key={x} position={[x, 1.11, 0.15]} material={MAT.mug}>
          <cylinderGeometry args={[0.06, 0.05, 0.12, 10]} />
        </mesh>
      ))}
      <mesh position={[1.2, 1.25, 0]} material={MAT.glass}>
        <cylinderGeometry args={[0.18, 0.18, 0.4, 14]} />
      </mesh>
    </group>
  );
}

const BOOK_COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa", "#f87171", "#e4e4e7"];

/** All books of every shelf in one instanced draw call. */
function Bookshelves() {
  const books = useRef<THREE.InstancedMesh>(null);
  const shelves: [number, number, number][] = [
    [-20.05, 0, -4.5],
    [-20.05, 0, 4.5],
    [20.05, 0, -4.5],
    [20.05, 0, 4.5],
  ];
  const perShelf = 3 * 9;

  useLayoutEffect(() => {
    const mesh = books.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    let i = 0;
    shelves.forEach(([x, , z]) => {
      for (let row = 0; row < 3; row += 1) {
        for (let n = 0; n < 9; n += 1) {
          const h = 0.42 + ((i * 7) % 5) * 0.05;
          matrix.makeScale(1, h, 1);
          matrix.setPosition(x - Math.sign(x) * 0.05, 0.62 + row * 0.75 + h / 2, z - 1.2 + n * 0.27);
          mesh.setMatrixAt(i, matrix);
          mesh.setColorAt(i, color.set(BOOK_COLORS[(i * 3) % BOOK_COLORS.length] ?? "#e4e4e7"));
          i += 1;
        }
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <group>
      {shelves.map(([x, , z]) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 1.5, 0]} material={MAT.frame}>
            <boxGeometry args={[0.5, 3, 2.8]} />
          </mesh>
          {[0.6, 1.35, 2.1].map((y) => (
            <mesh key={y} position={[-Math.sign(x) * 0.27, y, 0]} material={MAT.deskTop}>
              <boxGeometry args={[0.06, 0.05, 2.7]} />
            </mesh>
          ))}
        </group>
      ))}
      <instancedMesh ref={books} args={[undefined, undefined, shelves.length * perShelf]}>
        <boxGeometry args={[0.32, 1, 0.2]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </group>
  );
}

function StatusScreen({ working, total, labelScale }: { working: number; total: number; labelScale: number }) {
  return (
    <group position={[8.5, 0, -20.7]}>
      <mesh position={[0, 2.6, 0]} material={MAT.metal}>
        <boxGeometry args={[4.4, 2.5, 0.12]} />
      </mesh>
      <mesh position={[0, 2.6, 0.07]}>
        <planeGeometry args={[4.1, 2.2]} />
        <meshStandardMaterial color="#04140f" emissive="#064e3b" emissiveIntensity={0.9} />
      </mesh>
      <TextSprite text={`${working}/${total} trabajando`} position={[0, 2.85, 0.2]} height={0.55 * labelScale} color="#6ee7b7" />
      <TextSprite text={working > 0 ? "Oficina activa" : "En espera"} position={[0, 2.2, 0.2]} height={0.4 * labelScale} color="#a1a1aa" />
    </group>
  );
}

function TextSprite({
  text,
  position,
  height,
  color = "#d4d4d8",
}: {
  text: string;
  position: [number, number, number];
  height: number;
  color?: string;
}) {
  const { texture, aspect } = useMemo(() => {
    const font = '600 140px "Segoe UI", Arial, sans-serif';
    const measure = document.createElement("canvas").getContext("2d");
    if (measure) measure.font = font;
    const textWidth = measure ? measure.measureText(text).width : text.length * 72;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(256, Math.ceil(textWidth + 96));
    canvas.height = 192;
    const context = canvas.getContext("2d");

    if (context) {
      context.fillStyle = "rgba(5, 7, 10, 0.8)";
      context.beginPath();
      context.roundRect(8, 32, canvas.width - 16, 128, 28);
      context.fill();
      context.strokeStyle = "rgba(255, 255, 255, 0.12)";
      context.lineWidth = 3;
      context.stroke();

      context.fillStyle = color;
      context.font = font;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, canvas.width / 2, 98, canvas.width - 32);
    }

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.minFilter = THREE.LinearFilter;

    return { texture: map, aspect: canvas.width / canvas.height };
  }, [text, color]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={position} scale={[height * aspect, height, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthTest={false} toneMapped={false} />
    </sprite>
  );
}

function dampValue(current: number, target: number, lambda: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * delta));
}

function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-lambda * delta));
}
