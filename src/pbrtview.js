(function(exports) {
    "use strict";

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

            this._modelView = mat4.create();

            this._projection = mat4.create();
            mat4.perspective(this._projection, Math.PI / 4, gl.viewportWidth / gl.viewportHeight, 0.2, 256);

            gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

            this._renderCtx = new RenderContext(gl);
            this._renderCtx.modelView = this._modelView;
            this._renderCtx.projection = this._projection;

            this.models = [];
        },

        setCamera: function(mat) {
            mat4.copy(this._modelView, mat);
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
        var light = new Light([50, 40, 50], [1, 1, 1], 1000, 5);

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

        function setCameraFromTP(theta) {
            var camera = mat4.create();
            var rad = 50;
            var mx = rad * Math.cos(theta);
            var my = 30;
            var mz = rad * Math.sin(theta);

            mat4.lookAt(scene._modelView, [mx, my, mz], [0, 0, 0], [0, 1, 0]);
        }

        var T = 0.35, P = 0.10;

        function update(nt) {
            var dt = nt - t;
            t = nt;

            light.position[0] = Math.cos(t / 890) * 30;
            light.position[2] = Math.sin(t / 730) * 30;

            if (isKeyDown('A'))
                T += 0.05;
            if (isKeyDown('D'))
                T -= 0.05;
            if (isKeyDown('W'))
                P += 0.05;
            if (isKeyDown('S'))
                P -= 0.05;

            setCameraFromTP(T, P);

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
