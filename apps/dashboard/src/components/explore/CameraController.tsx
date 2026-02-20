import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

interface CameraControllerProps {
  target: [number, number, number] | null;
  distance?: number;
}

export function CameraController({
  target,
  distance = 30,
  homeDistance = 12,
}: CameraControllerProps & { homeDistance?: number }) {
  const { camera, controls } = useThree();
  const goalPos = useRef(new THREE.Vector3());
  const goalTarget = useRef(new THREE.Vector3());
  const animating = useRef(false);

  useEffect(() => {
    if (!target) {
      // Fly back to overview
      goalTarget.current.set(0, 0, 0);
      goalPos.current.set(0, 0, homeDistance);
      animating.current = true;
      return;
    }
    goalTarget.current.set(...target);
    goalPos.current.set(target[0], target[1], target[2] + distance);
    animating.current = true;
  }, [target, distance, homeDistance]);

  useFrame(() => {
    if (!animating.current) return;

    camera.position.lerp(goalPos.current, 0.05);

    // Also move OrbitControls target so rotation stays centered on the cluster
    const orbitControls = controls as unknown as { target: THREE.Vector3 };
    if (orbitControls?.target) {
      orbitControls.target.lerp(goalTarget.current, 0.05);
    }

    // Stop animating once close enough
    if (camera.position.distanceTo(goalPos.current) < 0.1) {
      animating.current = false;
    }
  });

  return null;
}
