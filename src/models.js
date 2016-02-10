// Contains all the models in the scene, and shader code.

(function(exports) {
    "use strict";

    var Models = {};

    var TAU = Math.PI * 2;

    var GREEN  = [0.6, 0.8, 0.2];
    var PURPLE = [0.4, 0.2, 0.8];
    var PINK   = [1.0, 0.2, 0.8];

    var VERT_N_ITEMS = 3;
    var VERT_N_BYTES = VERT_N_ITEMS * Float32Array.BYTES_PER_ELEMENT;

    // A dumb hack to have "multiline strings".
    function M(X) { return X.join('\n'); }

    var Group = new Class({
        Name: 'Group',

        initialize: function() {
            this.children = [];
            this.localMatrix = mat4.create();
        },

        render: function(ctx) {
            this.forEach(function(mdl) {
                mdl.render(ctx);
            });
        },

        attachModel: function(model) {
            this.children.push(model);
            model.parentGroup = this;
        },

        applyModelMatrix: function(mtx) {
            if (this.parentGroup)
                this.parentGroup.applyModelMatrix(mtx);

            mat4.multiply(mtx, mtx, this.localMatrix);
        },

        forEach: function(cb) {
            this.children.forEach(cb);
        },
    });
    Models.Group = Group;

    var BaseModel = new Class({
        Name: 'BaseModel',

        initialize: function(gl) {
            this._gl = gl;

            this._renderProgram = null;
            this._contactPoint = null;
            this._primitives = [];
            this._surface = null;
            this.localMatrix = mat4.create();

            var args = [].slice.call(arguments, 1);
            this._buildModel.apply(this, args);
        },

        applyModelMatrix: function(mtx) {
            if (this.parentGroup)
                this.parentGroup.applyModelMatrix(mtx);

            mat4.multiply(mtx, mtx, this.localMatrix);
        },

        _buildModel: function() {
        },

        _setBuffers: function(verts, nrmls) {
            var gl = this._gl;
            this._vertBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._vertBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

            this._nrmlBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._nrmlBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, nrmls, gl.STATIC_DRAW);

            this._loaded = true;
        },

        _renderPrologue: function(ctx) {
            var gl = this._gl;
            var prog = ctx.currentProgram;
            gl.uniformMatrix4fv(prog.uniforms.projection, false, ctx.projection);

            var mdlMtx = mat4.create();
            this.applyModelMatrix(mdlMtx);
            gl.uniformMatrix4fv(prog.uniforms.localMatrix, false, mdlMtx);

            var mtx = mat4.create();
            mat4.multiply(mtx, ctx.modelView, mdlMtx);
            gl.uniformMatrix4fv(prog.uniforms.modelView, false, mtx);
            mat4.invert(mtx, mtx);
            mat4.transpose(mtx, mtx);
            gl.uniformMatrix4fv(prog.uniforms.normalMatrix, false, mtx);

            gl.bindBuffer(gl.ARRAY_BUFFER, this._nrmlBuffer);
            gl.vertexAttribPointer(prog.attribs.normal, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(prog.attribs.normal);

            gl.bindBuffer(gl.ARRAY_BUFFER, this._vertBuffer);
            gl.vertexAttribPointer(prog.attribs.position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(prog.attribs.position);
        },
        _renderEpilogue: function(ctx) {
            var gl = this._gl;
            var prog = ctx.currentProgram;
            gl.disableVertexAttribArray(prog.attribs.position);
            gl.disableVertexAttribArray(prog.attribs.normal);
        },
        _renderPrimitive: function(ctx, prim) {
            var gl = this._gl;
            gl.drawArrays(prim.drawType, prim.start, prim.count);
        },

        render: function(ctx) {
            if (this._loaded === false)
                return;

            ctx.setProgram(this._renderProgram);
            this._renderPrologue(ctx);
            this._primitives.forEach(function(prim) {
                this._renderPrimitive(ctx, prim);
            }.bind(this));
            this._renderEpilogue(ctx);
        },

        _renderPickSurface: function(ctx, surface) {
            this._renderPrimitive(ctx, surface.prim);
        },
        pick: function(ctx, pickId) {
            this._renderPrologue(ctx);
            this._renderPrimitive(ctx, this._surface.prim);
            this._renderEpilogue(ctx);
        },
    });

    var SINGLE_LIGHT_VERT_SHADER_SOURCE = M([
        'precision mediump float;',
        '',
        'struct Light {',
        '    vec3 pos, color;',
        '    float distanceCutoff, decay;',
        '};',
        '',
        'uniform mat4 u_localMatrix;',
        'uniform mat4 u_modelView;',
        'uniform mat4 u_normalMatrix;',
        'uniform mat4 u_projection;',
        'uniform Light u_light;',
        '',
        'attribute vec3 a_position;',
        'attribute vec3 a_normal;',
        '',
        'varying vec4 v_position;',
        'varying vec4 v_normal;',
        '',
        'void main() {',
        '    v_position = u_localMatrix * vec4(a_position, 1.0);',
        '    v_normal = u_modelView * vec4(a_normal, 1.0);',
        '    gl_Position = u_projection * u_modelView * vec4(a_position, 1.0);',
        '}',
    ]);

    /*
    var SINGLE_LIGHT_FRAG_SHADER_SOURCE = M([
        'precision mediump float;',
        '',
        'uniform vec3 u_modelDiff;',
        '',
        'varying vec4 v_eye;',
        'varying vec4 v_normal;',
        '',
        '// https://www.unrealengine.com/blog/physically-based-shading-on-mobile',
        'vec3 brdfApprox(const in vec3 specular, const in float roughness, const in float NoV) {',
        '    const vec4 c0 = vec4(-1, -0.0275, -0.572, 0.022);',
        '    const vec4 c1 = vec4(1, 0.0425, 1.04, -0.04);',
        '    vec4 r = roughness * c0 + c1;',
        '    float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;',
        '    vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;',
        '    return specular * AB.x + AB.y;',
        '}',
        '',
        'vec3 iblApprox(const in vec3 N, const in vec3 V,',
        '               const in vec3 specular, const in float roughness) {',
        '    float NoV = clamp( dot( N, V ), 0.0, 1.0 );',
        '    return brdfApprox(specular, roughness, NoV);',
        '}',
        '',
        'vec3 ibl(const in vec3 N, const in vec3 V, const in vec3 albedo,',
        '         const in vec3 specular, const in float roughness) {',
        '    vec3 color = vec3(0.0, 0.0, 0.0);',
        '    color += albedo;',
        // '    color += iblApprox(N, V, specular, roughness);',
        '    return color;',
        '}',
        '',
        'void main() {',
        '    vec3 albedo = u_modelDiff;',
        '    float roughness = 0.142857;',
        '    vec3 specular = vec3(1.0, 0.765557, 0.336057);',
        '    vec3 color = ibl(v_normal.xyz, -v_eye.xyz, albedo, specular, roughness);',
        '    gl_FragColor = vec4(color, 1.0);',
        '}',
    ]);
    */

    var SINGLE_LIGHT_FRAG_SHADER_SOURCE = M([
        'precision mediump float;',
        '',
        'struct Light {',
        '    vec3 pos, color;',
        '    float distanceCutoff, decay;',
        '};',
        '',
        'uniform vec3 u_modelDiff;',
        'uniform Light u_light;',
        '',
        'varying vec4 v_position;',
        'varying vec4 v_normal;',
        '',
        'float attenuate(const in Light light, const in float dist) {',
        '    return pow(clamp(1.0 + -dist / light.distanceCutoff, 0.0, 1.0), light.decay);',
        '}',
        '',
        'vec3 light_getIrradiance(const in Light light) {',
        '    vec3 diff = light.pos.xyz - v_position.xyz;',
        '    vec3 color = light.color * attenuate(light, length(diff));',
        '    vec3 direction = normalize(diff);',
        '    float NoL = clamp(dot(v_position.xyz, direction), 0.0, 1.0);',
        '    vec3 irradiance = NoL * color;',
        '    return irradiance;',
        '}',
        '',
        'void main() {',
        '    vec3 albedo = u_modelDiff;',
        '    // Crummy env lighting.',
        '    vec3 indirectIrradiance = albedo * 0.75;',
        '',
        '    vec3 directIrradiance = light_getIrradiance(u_light);',
        '    vec3 color = directIrradiance + indirectIrradiance;',
        '    gl_FragColor = vec4(color, 1.0);',
        '}',
    ]);

    function createSingleLightProgram(gl) {
        var vertShader = GLUtils.compileShader(gl, SINGLE_LIGHT_VERT_SHADER_SOURCE, gl.VERTEX_SHADER);
        var fragShader = GLUtils.compileShader(gl, SINGLE_LIGHT_FRAG_SHADER_SOURCE, gl.FRAGMENT_SHADER);

        var prog = gl.createProgram();
        gl.attachShader(prog, vertShader);
        gl.attachShader(prog, fragShader);
        gl.linkProgram(prog);

        prog.uniforms = {};
        prog.uniforms.projection = gl.getUniformLocation(prog, "u_projection");
        prog.uniforms.localMatrix = gl.getUniformLocation(prog, "u_localMatrix");
        prog.uniforms.modelView = gl.getUniformLocation(prog, "u_modelView");
        prog.uniforms.normalMatrix = gl.getUniformLocation(prog, "u_normalMatrix");
        prog.uniforms.modelDiffuse = gl.getUniformLocation(prog, "u_modelDiff");

        prog.uniforms.light = {};
        prog.uniforms.light.position = gl.getUniformLocation(prog, "u_light.pos");
        prog.uniforms.light.color = gl.getUniformLocation(prog, "u_light.color");
        prog.uniforms.light.distanceCutoff = gl.getUniformLocation(prog, "u_light.distanceCutoff");
        prog.uniforms.light.decay = gl.getUniformLocation(prog, "u_light.decay");

        prog.attribs = {};
        prog.attribs.position = gl.getAttribLocation(prog, "a_position");
        prog.attribs.normal = gl.getAttribLocation(prog, "a_normal");

        return prog;
    }

    var SingleLightModel = new Class({
        Name: 'SingleLightModel',
        Extends: BaseModel,

        _buildModel: function() {
            this.parent();
            var gl = this._gl;
            this._renderProgram = createSingleLightProgram(gl);
        },

        _renderPrologue: function(ctx) {
            this.parent(ctx);
            var gl = this._gl;
            var prog = ctx.currentProgram;

            gl.uniform3fv(prog.uniforms.light.position, this._light.position);
            gl.uniform3fv(prog.uniforms.light.color, this._light.color);
            gl.uniform1f(prog.uniforms.light.distanceCutoff, this._light.distanceCutoff);
            gl.uniform1f(prog.uniforms.light.decay, this._light.decay);
            gl.uniform3fv(prog.uniforms.modelDiffuse, this._diffuseColor);
        },

        setLight: function(light) {
            this._light = light;
        },
        setMaterial: function(diffuseColor) {
            this._diffuseColor = diffuseColor;
        },
    });

    function fetch(path) {
        var request = new XMLHttpRequest();
        request.open("GET", path, true);
        request.responseType = "arraybuffer";
        // request.overrideMimeType('text/plain');
        request.send();
        return request;
    }

    var JMDL = new Class({
        Name: 'JMDL',
        Extends: SingleLightModel,

        _buildModel: function(filename) {
            this.parent();

            var req = fetch(filename);
            this._loaded = false;
            req.onload = function() {
                this._buildModelBuf(req.response);
            }.bind(this);
        },
        _buildModelObj: function(S) {
            var gl = this._gl;

            var lines = S.split('\n');
            var v = ['dummy'];
            var f = [];

            function parse3(parts) {
                return parts.map(function(v) { return parseFloat(v); });
            }
            function parsef(parts) {
                function parseaf(af) {
                    var ap = af.split('/');
                    var vi = ap[0];
                    return v[vi];
                }
                return parts.map(function(v) { return parseaf(v); });
            }

            lines.forEach(function(line) {
                var parts = line.split(' ');
                var cmd = parts.shift();
                if (cmd === 'v')
                    return v.push(parse3(parts));
                if (cmd === 'f')
                    return f.push(parsef(parts));
            });

            var nface = f.length;
            var verts = new Float32Array(3 * 3 * nface);
            var norms = new Float32Array(3 * 3 * nface);
            for (var i = 0; i < nface; i++) {
                for (var j = 0; j < 3; j++) {
                    verts[i*9+j*3+0] = f[i][j][0];
                    verts[i*9+j*3+1] = f[i][j][1];
                    verts[i*9+j*3+2] = f[i][j][2];
                }
            }

            var prim = {};
            prim.start = 0;
            prim.count = nface * 3;
            prim.drawType = gl.TRIANGLES;
            this._primitives.push(prim);

            this._setBuffers(verts, norms);
        },
        _buildModelBuf: function(buffer) {
            var gl = this._gl;

            var offs = 0;
            var view = new DataView(buffer);
            function req(match) {
                var buf = new Uint8Array(buffer, offs, match.length);
                var S = '';
                for (var i = 0; i < match.length; i++) {
                    var elem = buf[i];
                    if (buf[i] !== match.charCodeAt(i))
                        XXX;
                }
                offs += match.length;
            }
            function int() {
                return view.getUint32((offs += 4) - 4, false);
            }
            function flt() {
                return view.getFloat((offs += 4) - 4);
            }

            req('JMDL');
            var nface = int();

            req('JVTX');
            var verts = new Float32Array(buffer, offs, 3 * 3 * nface);
            offs += 4 * 3 * 3 * nface;

            req('JNRM');
            var norms = new Float32Array(buffer, offs, 3 * 3 * nface);
            offs += 4 * 3 * 3 * nface;

            var prim = {};
            prim.color = [0.92, 0.92, 0.92];
            prim.start = 0;
            prim.count = nface * 3;
            prim.drawType = gl.TRIANGLES;
            this._primitives.push(prim);

            this._setBuffers(verts, norms);
        },
    });
    Models.JMDL = JMDL;

    var Plane = new Class({
        Name: 'Plane',
        Extends: SingleLightModel,

        _buildModel: function() {
            this.parent();

            var gl = this._gl;

            var verts = new Float32Array(VERT_N_ITEMS * 4);
            var nrmls = new Float32Array(VERT_N_ITEMS * 4);

            verts[0]  = -1;
            verts[1]  = 0;
            verts[2]  = -1;
            verts[3]  = 1;
            verts[4]  = 0;
            verts[5]  = -1;
            verts[6]  = -1;
            verts[7]  = 0;
            verts[8]  = 1;
            verts[9]  = 1;
            verts[10] = 0;
            verts[11] = 1;

            var prim = {};
            prim.color = [0.8, 0.8, 0.8];
            prim.start = 0;
            prim.count = 4;
            prim.drawType = gl.TRIANGLE_STRIP;
            this._primitives.push(prim);

            this._setBuffers(verts, nrmls);
        },
    });
    Models.Plane = Plane;

    exports.Models = Models;

})(window);
