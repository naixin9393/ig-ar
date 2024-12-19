import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";

let container;
let camera, scene, renderer;
let target;
const cones = [];

initConfiguration();
initScene();
addInteraction();

function initConfiguration() {
  container = document.createElement("div");
  document.body.appendChild(container);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    40
  );

  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  document.body.appendChild(
    ARButton.createButton(renderer, {
      requiredFeatures: ["hit-test", "depth-sensing"], // New feature
      depthSensing: {
        usagePreference: ["cpu-optimized"],
        dataFormatPreference: ["luminance-alpha"],
      },
    })
  );

  renderer.domElement.style.display = "none";

  addTargetObject();
  renderer.setAnimationLoop(render);
  window.addEventListener("resize", onWindowResize, false);
}

function addTargetObject() {
  const geometry = new THREE.RingBufferGeometry(0.15, 0.2, 32).rotateX(
    -Math.PI / 2
  );
  const material = new THREE.MeshBasicMaterial();

  target = new THREE.Mesh(geometry, material);

  target.matrixAutoUpdate = false; // We will calculate the position and rotation each frame
  target.visible = false; // Only visible if the target hits something
  scene.add(target);

  // target.add(new THREE.AxesHelper(1)); // Axis helper
}

function initScene() {
  var light = new THREE.HemisphereLight(
    0xffffbb, // Sky Color
    0x080820, // Ground Color
    1
  );
  light.position.set(0.5, 1, 0.25);

  scene.add(light);
  const material = new THREE.MeshPhongMaterial({
    color: new THREE.Color("rgb(226,35,213)"),
    shininess: 6,
    shading: true,
    transparent: 1,
    opacity: 0.8,
  });
}

function addInteraction() {
  var controller = renderer.xr.getController(0);
  controller.addEventListener("select", onSelect);
  scene.add(controller);
}

function onSelect() {
  if (target.visible) {
    // cone added at the point of a hit test
    // replace the next lines to add your own object in space
    const geometry = new THREE.CylinderBufferGeometry(0, 0.05, 0.2, 32);
    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff * Math.random(),
    });
    const mesh = new THREE.Mesh(geometry, material);

    // set the position of the cylinder based on where the reticle is
    mesh.position.setFromMatrixPosition(target.matrix);
    mesh.quaternion.setFromRotationMatrix(target.matrix);

    cones.push(mesh);
    scene.add(mesh);
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Adding hit testing functions:
let hitTestSource = null;
let localSpace;
let hitTestSourceInitialized = false;

async function initializeHitTestSource() {
  const session = renderer.xr.getSession();

  // We use the viewer reference space (the devise position) and
  // this space is used to get the hit test source
  const viewerSpace = await session.requestReferenceSpace("viewer");
  hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
  localSpace = await session.requestReferenceSpace("local");

  // Everything is initialized
  hitTestSourceInitialized = true;

  // If the session ends, we cannot use this variables
  session.addEventListener("end", () => {
    hitTestSourceInitialized = false;
    hitTestSource = null;
  });
}

function render(timestamp, frame) {
  if (frame) {
    // Initialize
    if (!hitTestSourceInitialized) {
      initializeHitTestSource();
      console.log("init");
    }

    // Get hit test results
    else if (hitTestSourceInitialized) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);

      // We only check the first one
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        // Get a pose from the hit test result. The pose represents the pose of a point on a surface.
        const pose = hit.getPose(localSpace);

        target.visible = true;
        // Transform/move the reticle image to the hit test position
        target.matrix.fromArray(pose.transform.matrix);
      } else {
        target.visible = false;
      }

      const session = frame.session;
      const pose = frame.getViewerPose(localSpace);
      renderer.render(scene, camera);

      if (pose) {
        for (const view of pose.views) {

          const depthData = frame.getDepthInformation(view);

          if (depthData && cones.length != 0) {
            for (const cone of cones) {
              const coneWorldPosition = cone.getWorldPosition(
                new THREE.Vector3()
              );

              const ndc = coneWorldPosition.clone().project(camera);

              var distance;
              const virtualDistance = camera.position.distanceTo(cone.position);

              if (ndc.x < 1.0 && ndc.x > -1.0 && ndc.y < 1.0 && ndc.y > -1.0) {
                distance = depthData.getDepthInMeters(
                  (ndc.x + 1) / 2,
                  (ndc.y + 1) / 2
                );
              }

              // If the depth value is not null and it is closer than the target's position, hide the cone
              if (distance !== null && distance < virtualDistance * 0.9) {
                if (cone) cone.visible = false;
              } else {
                if (cone) cone.visible = true; // Make cone visible if no obstruction
              }
            }
          }
        }
      }
    }
  }
}
