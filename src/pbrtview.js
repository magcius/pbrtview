(function(exports) {
    "use strict";

    function clamp(x, min, max) {
        return Math.max(min, Math.min(x, max));
    }
    function absclamp(x, lim) {
        return clamp(x, -lim, lim);
    }

    var RenderContext = new Class({
        Name: 'RenderContext',

        initialize: function(gl) {
            this._gl = gl;

            this.currentProgram = null;
        },

        setProgram: function(prog) {
            var gl = this._gl;

            this.currentProgram = prog;
            gl.useProgram(this.currentProgram);
        },
    });

    // The main renderer.
    var Scene = new Class({
        initialize: function(gl) {
            this._gl = gl;

            this._view = mat4.create();

            this._projection = mat4.create();
            mat4.perspective(this._projection, Math.PI / 4, gl.viewportWidth / gl.viewportHeight, 0.2, 256);

            gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

            this._renderCtx = new RenderContext(gl);
            this._renderCtx.view = this._view;
            this._renderCtx.projection = this._projection;

            this.models = [];
        },

        setCamera: function(mat) {
            mat4.copy(this._view, mat);
        },

        attachModel: function(model) {
            this.models.push(model);
        },

        _render: function() {
            var gl = this._gl;

            gl.enable(gl.DEPTH_TEST);
            gl.clearColor(0.88, 0.88, 0.88, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            this.models.forEach(function(model) {
                model.render(this._renderCtx);
            }.bind(this));
        },
        update: function() {
            this._render();
        },
    });

    function Light(position, color, distanceCutoff, decay) {
        return { position: position, color: color,
                 distanceCutoff: distanceCutoff, decay: decay };
    }

    function createViewer(canvas) {
        var gl = canvas.getContext("webgl", { alpha: false });

        // Enable EXT_frag_depth
        gl.getExtension('EXT_frag_depth');

        gl.viewportWidth = canvas.width;
        gl.viewportHeight = canvas.height;

        var scene = new Scene(gl);
        var light = new Light([50, 20, 50], [1, .5, 1], 1000, 5);

        var eh = new Models.Group();
        mat4.scale(eh.localMatrix, eh.localMatrix, [2, 2, 2]);

        var eh_t = new Models.JMDL(gl, 'eh_t.jmdl');
        eh_t.setMaterial([0.92, 0.92, 0.92]);
        eh.attachModel(eh_t);
        var eh_b = new Models.JMDL(gl, 'eh_b.jmdl');
        eh_b.setMaterial([1.0, 0.4, 0.4]);
        eh.attachModel(eh_b);

        eh.forEach(function(mdl) { mdl.setLight(light) });
        scene.attachModel(eh);

        var plane = new Models.Plane(gl);
        plane.setLight(light);
        plane.setMaterial([0.8, 0.8, 0.8]);
        mat4.scale(plane.localMatrix, plane.localMatrix, [50, 1, 50]);
        scene.attachModel(plane);

        var light_bb = new Models.Billboard(gl);
        light_bb.setColor(light.color);
        scene.attachModel(light_bb);

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
                0, 0, -100, 1
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

        var T = 0.35, P = 0.15;

        function update(nt) {
            var dt = nt - t;
            t = nt;

            light.position[0] = Math.cos(t / 890) * 30;
            light.position[2] = Math.sin(t / 730) * 30;
            light_bb.setPosition(light.position);

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
            var drag = dragging ? 0.94 : 0.98;
            P += vP / 10; vP *= drag;
            T += vT / 10; vT *= drag;
            if (P < 0.04) P = 0.04, vP = 0;
            if (P > 1.50) P = 1.50, vP = 0;
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
