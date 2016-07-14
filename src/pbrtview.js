(function(exports) {
    "use strict";

    function clamp(x, min, max) {
        return Math.max(min, Math.min(x, max));
    }
    function absclamp(x, lim) {
        return clamp(x, -lim, lim);
    }
    function sign(n) {
        return n === 0 ? 0 : n > 0 ? 1 : -1;
    }

    function createViewer(canvas) {
        var gl = canvas.getContext("webgl", { alpha: false });

        gl.viewportWidth = canvas.width;
        gl.viewportHeight = canvas.height;

        var scene = new Models.Scene(gl);
        var lights = [
            new Models.Light(gl, [50, 50, 50], [1, .6, .6], 100),
            new Models.Light(gl, [50, 45, 50], [.6, 1, .6], 125),
            new Models.Light(gl, [50, 55, 50], [.6, .6, 1], 150),
        ];
        scene.setLights(lights);

        var eh_t = new Models.JMDL(gl, 'eh_t.jmdl');
        eh_t.setMaterial(new Models.PBRMaterial(gl, [0.92, 0.92, 0.92], 0.1));
        var eh_b = new Models.JMDL(gl, 'eh_b.jmdl');
        eh_b.setMaterial(new Models.PBRMaterial(gl, [1.0, 0.4, 0.4], 0.5));

        var eh1 = new Models.Group();
        mat4.scale(eh1.localMatrix, eh1.localMatrix, [2, 2, 2]);
        eh1.attachModel(eh_t);
        eh1.attachModel(eh_b);
        scene.attachModel(eh1);

        var plane = new Models.Plane(gl);
        plane.setMaterial(new Models.PBRMaterial(gl, [1, 1, 1], 0.5));
        mat4.scale(plane.localMatrix, plane.localMatrix, [50, 1, 50]);
        scene.attachModel(plane);

        window.lights = lights;
        lights.forEach(function(light) {
            light.bb = new Models.Billboard(gl);
            scene.attachModel(light.bb);
        });

        var keysDown = {};
        var SHIFT = 16;

        function isKeyDown(key) {
            return !!keysDown[key.charCodeAt(0)];
        }

        window.addEventListener('keydown', function(e) {
            keysDown[e.keyCode] = true;
        });
        window.addEventListener('keyup', function(e) {
            delete keysDown[e.keyCode];
        });
        var t = 0;

        var Z = -150;
        var vZ = 0;
        function updateCamera() {
            var x = P, y = T;
            var sinX = Math.sin(x);
            var cosX = Math.cos(x);
            var sinY = Math.sin(y);
            var cosY = Math.cos(y);
            var camera = [
                cosY, sinX*sinY, -cosX*sinY, 0,
                0, cosX, sinX, 0,
                sinY, -sinX*cosY, cosX*cosY, 0,
                0, 0, Z, 1,
            ];
            scene.setCamera(camera);
        }

        var vT = 0, vP = 0;
        var dragging = false, px, py;
        canvas.addEventListener('mousedown', function(e) {
            dragging = true;
            canvas.classList.add('grabbing');
            px = e.pageX; py = e.pageY;
        });
        canvas.addEventListener('mouseup', function(e) {
            dragging = false;
            canvas.classList.remove('grabbing');
        });
        canvas.addEventListener('mousemove', function(e) {
            if (!dragging)
                return;

            var dx = e.pageX - px;
            var dy = e.pageY - py;
            px = e.pageX; py = e.pageY;

            vT += dx / 200;
            vP += dy / 200;
        });
        canvas.addEventListener('wheel', function(e) {
            vZ += sign(e.deltaY) * -4;
            e.preventDefault();
        });

        var T = 0.35, P = 0.15;

        function update(nt) {
            var dt = nt - t;
            t = nt;

            lights[0].position[0] = Math.cos(t / 890) * 30;
            lights[0].position[2] = Math.sin(t / 730) * 30;
            lights[1].position[0] = Math.cos(t / 930 + 1) * 30;
            lights[1].position[2] = Math.sin(t / 670 + 1) * 30;
            lights[2].position[0] = Math.cos(t / 430 + 1.2) * 30;
            lights[2].position[2] = Math.cos(t / 610 + 1.2) * 30;

            lights.forEach(function(light) {
                light.bb.setPosition(light.position);
                light.bb.setColor(light.color);
            });

            if (isKeyDown('A'))
                vT += 0.05;
            if (isKeyDown('D'))
                vT -= 0.05;
            if (isKeyDown('W'))
                vP += 0.05;
            if (isKeyDown('S'))
                vP -= 0.05;

            vP = absclamp(vP, 2);
            vT = absclamp(vT, 2);
            var drag = dragging ? 0.92 : 0.96;
            P += vP / 10; vP *= drag;
            if (P < 0.04) P = 0.04, vP = 0;
            if (P > 1.50) P = 1.50, vP = 0;
            T += vT / 10; vT *= drag;
            Z += vZ; vZ *= 0.8;
            if (Z > -10) Z = -10, vZ = 0;
            updateCamera();

            scene.update();
            window.requestAnimationFrame(update);
        }

        update(0);
    }

    window.addEventListener('load', function() {
        var canvas = document.querySelector("canvas");
        createViewer(canvas);
    });

})(window);
