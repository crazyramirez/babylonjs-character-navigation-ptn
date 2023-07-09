
// On Document Loaded - Start Game //
document.addEventListener("DOMContentLoaded", startGame);

// Global BabylonJS Variables
var canvas = document.getElementById("renderCanvas");
var engine = new BABYLON.Engine(canvas, true, { stencil: false }, true);
var scene = createScene(engine, canvas);
var dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(0,0,0), scene);
var shadowGenerator = new BABYLON.ShadowGenerator(1024, dirLight, true);

// Skybox
var hdrTexture;
var hdrRotation = 0;
var hdrSkybox;

// Player & Navigation
var recastLoaded = false;
var playerTransform;
var pointNav;
let navigationPlugin;
var ground;
var groundMat;
var navmeshdebug;

// Animations
var currentAnim = new BABYLON.AnimationGroup();
var idleAnim = new BABYLON.AnimationGroup();
var walkAnim = new BABYLON.AnimationGroup();

// Collision Boxes
var box1, box2, box3;


// Create Scene
function createScene(engine, canvas) {
    canvas = document.getElementById("renderCanvas");
    engine.clear(new BABYLON.Color3(0, 0, 0), true, true);
    scene = new BABYLON.Scene(engine);

    return scene;
}

// Start Game
function startGame() {
    
    // Set Canvas & Engine //
    var toRender = function () {
        scene.render();
    }
    engine.runRenderLoop(toRender);

    // Create Default Camera
    scene.createDefaultCamera();

    // Directional Light //
    dirLight.intensity = 2.0;
    dirLight.position = new BABYLON.Vector3(0,10,10);
    dirLight.direction = new BABYLON.Vector3(-2, -4, -5);

    // Shadows
    shadowGenerator.bias = 0.001;
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.useKernelBlur = true;
    shadowGenerator.blurKernel = 20; 
    shadowGenerator.blurScale = 2;
    dirLight.shadowMinZ = 0;
    dirLight.shadowMaxZ = 200;

    // Ground //
    ground = BABYLON.MeshBuilder.CreateGround("ground", {width: 30, height: 30}, scene);
    ground.isPickable = false;
    groundMat = new BABYLON.PBRMaterial("groundMaterial", scene);
    groundMat.albedoColor = new BABYLON.Color3(0.95,0.95,0.95);
    groundMat.roughness = 0.85;
    ground.material = groundMat;
    ground.receiveShadows = true;

    // Create Boxes
    createBoxes();

    // Import Reallusion CC4 Character
    importModelAsync("Character.glb");
    
    // Recast Navigation
    loadRecast(scene);

    // Stats
    var statsDiv = document.getElementById("stats-text");
    setInterval(() => {
        statsDiv.innerHTML = "<b>" + Math.round(engine.getFps()) + " FPS</b> ";
    }, 100);

    // scene.performancePriority = BABYLON.ScenePerformancePriority.BackwardCompatible;
    // scene.debugLayer.show({embedMode: true}).then(function () {
    // });
}

// Create Boxes
function createBoxes() {
    box1 = BABYLON.MeshBuilder.CreateBox("box1", {size: 1}, scene);
    box1.position.x = 3;
    box1.position.y = 0.5;
    box1.material = groundMat;

    box2 = BABYLON.MeshBuilder.CreateBox("box2", {size: 1}, scene);
    box2.position.x = -4;
    box2.position.z = -2;
    box2.position.y = 0.5;
    box2.material = groundMat;

    box3 = BABYLON.MeshBuilder.CreateBox("box3", {size: 1}, scene);
    box3.position.x = -2;
    box3.position.z = 3;
    box3.position.y = 0.5;
    box3.material = groundMat;
}


// Load Models Async Function //
function importModelAsync(model) {
    Promise.all([
        BABYLON.SceneLoader.ImportMeshAsync(null, "./resources/models/" , model, scene).then(function (result) {
        
            // Setup Animations
            idleAnim = scene.getAnimationGroupByName("idle");
            walkAnim = scene.getAnimationGroupByName("walk");
            idleAnim.start(true);
            currentAnim = idleAnim;

            // Setup Player
            var player = result.meshes[0];
            player.isPickable = false;
    
            // Correct Rotation from Imported Model
            player.rotation = new BABYLON.Vector3(0, Math.PI/0.8, 0);

            // Create a Main Player Transform Root
            playerTransform = new BABYLON.TransformNode("Player_Root", scene);    
            player.parent = playerTransform;

            // Setup Navigation
            setTimeout(() => {
                // Create Point Navigation
                createPointNav();
                // Setup Player Navigation
                setNavigation(player);            
            }, 500);

            // Setup Arc Rotate Camera With Target
            createArcRotateCameraWithTarget(player);
        }),

    ]).then(() => {
        setLighting();    
        setReflections();
        setShadows();
        setTimeout(() => {
            hideLoadingView();              
        }, 500);
    });
}

// Arc Rotate Camera with Target
function createArcRotateCameraWithTarget(target) {
    scene.activeCamera.dispose();
    var camera = new BABYLON.ArcRotateCamera("camera", BABYLON.Tools.ToRadians(90), BABYLON.Tools.ToRadians(65), 10, BABYLON.Vector3.Zero(), scene);
    camera.setTarget(target, true, false, false);
    camera.allowUpsideDown = false;
    camera.panningSensibility = 0;
    camera.allowUpsideDown = false;
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 20;
    camera.upperBetaLimit = Math.PI / 2.2;
    camera.panningSensibility = 0;
    camera.cameraAcceleration = .1; // how fast to move
    camera.maxCameraSpeed = 2; // speed limit
    camera.pinchDeltaPercentage = 0.00060;
    camera.wheelPrecision = 20;
    scene.activeCamera = camera;
    camera.useBouncingBehavior = false;
    camera.useAutoRotationBehavior = false;
    camera.attachControl(canvas, true);
}

// Environment Lighting
function setLighting() {
    hdrTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("./resources/env/environment_19.env", scene);
    hdrTexture.rotationY = BABYLON.Tools.ToRadians(hdrRotation);
    hdrSkybox = BABYLON.MeshBuilder.CreateBox("skybox", {size: 1024}, scene);
    var hdrSkyboxMaterial = new BABYLON.PBRMaterial("skybox", scene);
    hdrSkyboxMaterial.backFaceCulling = false;
    hdrSkyboxMaterial.reflectionTexture = hdrTexture.clone();
    hdrSkyboxMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
    hdrSkyboxMaterial.microSurface = 0.65;
    hdrSkyboxMaterial.disableLighting = true;
    hdrSkybox.material = hdrSkyboxMaterial;
    hdrSkybox.infiniteDistance = true;
}

// Set Shadows Caster
function setShadows() {
    scene.meshes.forEach(function(mesh) {
        if (mesh.name != "skybox" 
        && mesh.name != "ground")
        {
            shadowGenerator.addShadowCaster(mesh);
        }
    });
}

// Set Reflections
function setReflections() {
    scene.materials.forEach(function (material) {
        if (material.name != "skybox") {
            material.reflectionTexture = hdrTexture;
            material.reflectionTexture.level = 0.6;
            material.disableLighting = false;
        }
    });
}

// Hide Loading View
function hideLoadingView() {
    document.getElementById("loadingDiv").style.display = "none";
}

// Resize Window
window.addEventListener("resize", function () {
    engine.resize();
});


// Recast Navigation
function loadRecast(scene) {
    async function asyncRecast() {
        setTimeout(() => {
            var badgeInfo = document.getElementById("badge");
            console.log("Loading RECAST");
            badgeInfo.innerHTML = " Loading Recast, Please Wait... ";
        }, 300);
        await Recast();   
        navigationPlugin = new BABYLON.RecastJSPlugin();
        navigationPlugin.setWorkerURL("./libs/navMeshWorker.js");
    }
    asyncRecast();
}

// Set Navigation
function setNavigation(player) {

    // Badge Information
    setTimeout(() => {
        var badgeInfo = document.getElementById("badge");
        badgeInfo.innerHTML = " Init Navigation, Please Wait... ";
    }, 300);

    // Nav Mesh Parameters
    var navmeshParameters = {
        cs: 0.4,
        ch: 0.01,
        walkableSlopeAngle: 0,
        walkableHeight: 0.0,
        walkableClimb: 0,
        walkableRadius: 2,
        maxEdgeLen: 12,
        maxSimplificationError: 1,
        minRegionArea: 15,
        mergeRegionArea: 20,
        maxVertsPerPoly: 6,
        detailSampleDist: 6,
        detailSampleMaxError: 35,
        borderSize: 1,
        tileSize:25
    };

    // Navigation Plugin CreateNavMesh (Ground and Boxes separated)
    // Also you can previosly merge all the navigation meshes
    navigationPlugin.createNavMesh([ground, box1, box2, box3], navmeshParameters,(navmeshData) =>
    {
        navigationPlugin.buildFromNavmeshData(navmeshData);
        navmeshdebug = navigationPlugin.createDebugNavMesh(scene);
        navmeshdebug.name = "ground";
        navmeshdebug.position = new BABYLON.Vector3(0, 0.01, 0);
        var matdebug = new BABYLON.StandardMaterial('matdebug', scene);
        matdebug.diffuseColor = new BABYLON.Color3(0.1, 0.2, 1);
        matdebug.alpha = 1;
        navmeshdebug.material = matdebug;
        navmeshdebug.visibility = 0.15;
        
        // Badge Information Ready to Navigate
        setTimeout(() => {
            var badgeInfo = document.getElementById("badge");
            badgeInfo.innerHTML = " Toggle NavMesh";
            console.log("RECAST Loaded");
        }, 300);
        
        recastLoaded = true;

        // Setup Navigation Plugin using one Player
        var crowd = navigationPlugin.createCrowd(1, 0.1, scene);

        // Crow
        var agentParams = {
            radius: 0.3,
            height: 0.01,
            maxAcceleration: 50.0,
            maxSpeed: 4,
            collisionQueryRange: 0.5,
            pathOptimizationRange: 0.2,
            separationWeight: 1.0};

        // Setup Player Position
        var position = navigationPlugin.getClosestPoint(new BABYLON.Vector3(0, 0, 0));

        // Add Agent
        var agentIndex = crowd.addAgent(position, agentParams, playerTransform);
        player.idx = agentIndex;

        // Hide Point Nav
        pointNav.visibility = 0;

        // Detecting Navigation Point Position
        var startingPoint;
        var getGroundPosition = function () {
            var pickinfo = scene.pick(scene.pointerX, scene.pointerY);
            if (pickinfo.hit) {
                return pickinfo.pickedPoint;
            }
            return null;
        }

        // Pointer Tap Functions
        var pointerTap = function (mesh) {
            console.log("Tap: " + mesh.name);
            
            // Detect Pointer Tap only on Ground Mesh 
            if (!mesh.name.includes("ground"))
                return;

            startingPoint = getGroundPosition();
            pointNav.position = startingPoint;
            pointNav.visibility = 1;
            var agents = crowd.getAgents();
            var i;

            for (i=0;i<agents.length;i++) {
                if (currentAnim == idleAnim)
                {
                    // Start Player Walk Animation
                    currentAnim = walkAnim;
                    scene.onBeforeRenderObservable.runCoroutineAsync(animationBlending(idleAnim, 1.0, walkAnim, 1.3, true, 0.05));
                }
                crowd.agentGoto(agents[i], navigationPlugin.getClosestPoint(startingPoint));
            }
        }
        
        // On Point Observable
        scene.onPointerObservable.add((pointerInfo) => {      		
            switch (pointerInfo.type) {
                case BABYLON.PointerEventTypes.POINTERTAP:
                    if(pointerInfo.pickInfo.hit) {
                        pointerTap(pointerInfo.pickInfo.pickedMesh)
                    }
                    break;
            }
        });

        // Crowd On Before Render Observable
        scene.onBeforeRenderObservable.add(()=> {
            // New Player Position
            playerTransform.position = crowd.getAgentPosition(player.idx);
            let vel = crowd.getAgentVelocity(player.idx);
            crowd.getAgentPositionToRef(player.idx, playerTransform.position);
            if (vel.length() > 1)
            {
                // New Player Rotation
                vel.normalize();
                var desiredRotation = Math.atan2(vel.x, vel.z);
                playerTransform.rotation.y = playerTransform.rotation.y + (desiredRotation - playerTransform.rotation.y);    
            }
        });

        // Crowd On Reach Target Observable
        crowd.onReachTargetObservable.add((agentInfos) => {
            console.log("agent reach destination");
            currentAnim = idleAnim;
            scene.onBeforeRenderObservable.runCoroutineAsync(animationBlending(walkAnim, 1.3, idleAnim, 1.0, true, 0.05));
            pointNav.visibility = 0;
        });

    });
}

// Animation Blending
function* animationBlending(fromAnim, fromAnimSpeedRatio, toAnim, toAnimSpeedRatio, repeat, animationBlendingSpeed)
{
    let currentWeight = 1;
    let newWeight = 0;
    fromAnim.stop();
    toAnim.play(repeat);
    fromAnim.speedRatio = fromAnimSpeedRatio;
    toAnim.speedRatio = toAnimSpeedRatio;
    while(newWeight < 1)
    {
        newWeight += animationBlendingSpeed;
        currentWeight -= animationBlendingSpeed;
        toAnim.setWeightForAllAnimatables(newWeight);
        fromAnim.setWeightForAllAnimatables(currentWeight);
        yield;
    }
}

// Create Point Navigation
function createPointNav() {
    pointNav = BABYLON.MeshBuilder.CreateGround("pointNav", {width: 1, height: 1}, scene);
    //pointNav = BABYLON.MeshBuilder.CreateBox("pointNav", {size: 2, height:0.01}, scene);
    pointNav.disableLighting = true;
    var pointNavMaterial = new BABYLON.StandardMaterial("pointNavMaterial", scene);
    pointNavMaterial.diffuseTexture = new BABYLON.Texture("./resources/images/circles.png");
    pointNavMaterial.diffuseTexture.hasAlpha = true;
    pointNavMaterial.useAlphaFromDiffuseTexture = true;
    pointNavMaterial.specularPower = 0;
    pointNavMaterial.specularColor = new BABYLON.Color3(0.1,0.1,0.1);
    pointNavMaterial.roughness = 1;
    pointNavMaterial.alphaCutOff  = 0.2;
    pointNavMaterial.backFaceCulling = false;
    pointNavMaterial.reflectionLevel = null;
    pointNavMaterial.emissiveColor = new BABYLON.Color3.White();
    pointNavMaterial.emissiveTexture = pointNavMaterial.albedoTexture;
    pointNavMaterial.emissiveIntensity = 0.3;
    pointNav.material = pointNavMaterial;
    pointNav.visibility = 0;
    
    var rot = 0;
    scene.registerAfterRender(()=>{
        pointNav.rotation.y = rot;
        rot += 0.03;
    });
}

function toggleNavMesh() {
    if (!navmeshdebug)
    return;

    if (navmeshdebug.visibility == 0)
    {
        navmeshdebug.visibility = 0.15;
    } else {
        navmeshdebug.visibility = 0;
    }
}