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
            this._primitives = [];
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

            if (verts) {
                this._vertBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, this._vertBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
            }

            if (nrmls) {
                this._nrmlBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, this._nrmlBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, nrmls, gl.STATIC_DRAW);
            }

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

            gl.uniformMatrix4fv(prog.uniforms.viewMatrix, false, ctx.view);

            mat4.multiply(mtx, ctx.view, mdlMtx);
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
    });

    var PBR_VERT_SHADER_SOURCE = M([
        'precision mediump float;',
        '',
        'uniform mat4 u_localMatrix;',
        'uniform mat4 u_viewMatrix;',
        'uniform mat4 u_normalMatrix;',
        'uniform mat4 u_projection;',
        '',
        'attribute vec3 a_position;',
        'attribute vec3 a_normal;',
        '',
        'varying vec4 v_positionWorld;',
        'varying vec4 v_positionEye;',
        'varying vec4 v_normalEye;',
        '',
        'void main() {',
        '    v_positionWorld = u_localMatrix * vec4(a_position, 1.0);',
        '    v_positionEye = u_viewMatrix * v_positionWorld;',
        '    v_normalEye = u_normalMatrix * vec4(a_normal, 1.0);',
        '    gl_Position = u_projection * v_positionEye;',
        '}',
    ]);

    var PBR_FRAG_SHADER_SOURCE = M([
        'precision mediump float;',
        '',
        'struct Light {',
        '    vec3 pos, color;',
        '    float radius;',
        '};',
        '',
        'struct Material {',
        '    float roughness;',
        '    vec3 diffuseColor;',
        '};',
        '',
        'uniform mat4 u_viewMatrix;',
        'uniform Material u_material;',
        '',
        '#define NUM_LIGHTS 4',
        'uniform Light u_lights[NUM_LIGHTS];',
        '',
        'varying vec4 v_positionWorld;',
        'varying vec4 v_positionEye;',
        'varying vec4 v_normalEye;',
        '',
        'float attenuate(const in Light light, const in float dist) {',
        '    float att = clamp(1.0 - dist/light.radius, 0.0, 1.0);',
        '    return att * att;',
        '}',
        '',
        'vec3 brdf_F_Schlick(const in vec3 L, const in vec3 H, const in vec3 specularColor) {',
        '    float LoH = clamp(dot(L, H), 0.0, 1.0);',
        '    float fresnel = pow(1.0 - LoH, 5.0);',
        '    return (1.0 - fresnel) * specularColor + fresnel;',
        '}',
        '',
        'float brdf_G_GGX_Smith(const in vec3 N, const in vec3 L, const in vec3 V, const in float roughness) {',
        '    // GGX / Smith from s2013_pbs_epic_notes_v2.pdf',
        '    float alpha = roughness * roughness;',
        '    float k = alpha * 0.5;',
        '',
        '    float NoL = clamp(dot(N, L), 0.0, 1.0);',
        '    float NoV = clamp(dot(N, V), 0.0, 1.0);',
        '    float G1L = 1.0 / (NoL * (1.0 - k) + k);',
        '    float G1V = 1.0 / (NoV * (1.0 - k) + k);',
        '    return (G1L * G1V) / (4.0);', 
        '}',
        '',
        'float brdf_D_GGX(const in vec3 N, const in vec3 H, const in float roughness) {',
        '    // Use the Disney GGX/Troughbridge-Reitz. Stolen from s2013_pbs_epic_notes_v2.pdf',
        '    float alpha = roughness * roughness;',
        '    float alpha2 = alpha * alpha;',
        '    float NoH = clamp(dot(N, H), 0.0, 1.0);',
        '    float denom = ((NoH * NoH) * (alpha2 - 1.0)) + 1.0;',
        '    return alpha2 / (denom * denom);',
        '}',
        '',
        'vec3 brdf_Specular_GGX(const in vec3 N, const in vec3 L, const in vec3 V, const in float roughness) {',
        '    vec3 H = normalize(L + V);',
        '    vec3 F = brdf_F_Schlick(L, H, vec3(0.04, 0.04, 0.04));',
        '    float G = brdf_G_GGX_Smith(N, L, V, roughness);',
        '    float D = brdf_D_GGX(N, H, roughness);',
        '    return F * G * D;',
        '}',
        '',
        'vec3 light_getReflectedLight(const in Light light) {',
        '    vec3 lightPosEye = (u_viewMatrix * vec4(light.pos, 1.0)).xyz;',
        '    vec3 lightToModel = lightPosEye - v_positionEye.xyz;',
        '    vec3 lightColor = light.color * attenuate(light, length(lightToModel));',
        '',
        '    vec3 L = normalize(lightToModel);',
        '    vec3 N = normalize(v_normalEye.xyz);',
        '    vec3 V = normalize(-v_positionEye.xyz);',
        '',
        '    float NoL = clamp(dot(N, L), 0.0, 1.0);',
        '    vec3 diffuse = u_material.diffuseColor;',
        '    vec3 specular = brdf_Specular_GGX(N, L, V, u_material.roughness);',
        '    vec3 directIrradiance = lightColor * NoL;',
        '',
        '    // Technically not energy-conserving, since we add the same light',
        '    // for both specular and diffuse, but it\'s minimal so we don\'t care...',
        '    vec3 outgoingLight = (directIrradiance * diffuse) + (directIrradiance * specular);',
        '    return outgoingLight;',
        '}',
        '',
        'void main() {',
        '    vec3 directReflectedLight = vec3(0.0);',
        '',
        '    for (int i = 0; i < NUM_LIGHTS; i++)',
        '        directReflectedLight += light_getReflectedLight(u_lights[i]);',
        '',
        '    vec3 indirectDiffuseIrradiance = vec3(0.5, 0.5, 0.5);',
        '    vec3 indirectReflectedLight = indirectDiffuseIrradiance * u_material.diffuseColor;',
        '    vec3 color = directReflectedLight + indirectReflectedLight;',
        '',
        '    gl_FragColor = vec4(color, 1.0);',
        '}',
    ]);

    function createPBRProgram(gl) {
        var vertShader = GLUtils.compileShader(gl, PBR_VERT_SHADER_SOURCE, gl.VERTEX_SHADER);
        var fragShader = GLUtils.compileShader(gl, PBR_FRAG_SHADER_SOURCE, gl.FRAGMENT_SHADER);

        var prog = gl.createProgram();
        gl.attachShader(prog, vertShader);
        gl.attachShader(prog, fragShader);
        gl.linkProgram(prog);

        prog.uniforms = {};
        prog.uniforms.projection = gl.getUniformLocation(prog, "u_projection");
        prog.uniforms.localMatrix = gl.getUniformLocation(prog, "u_localMatrix");
        prog.uniforms.viewMatrix = gl.getUniformLocation(prog, "u_viewMatrix");
        prog.uniforms.normalMatrix = gl.getUniformLocation(prog, "u_normalMatrix");
        prog.uniforms.diffuseColor = gl.getUniformLocation(prog, "u_material.diffuseColor");
        prog.uniforms.roughness = gl.getUniformLocation(prog, "u_material.roughness");

        prog.attribs = {};
        prog.attribs.position = gl.getAttribLocation(prog, "a_position");
        prog.attribs.normal = gl.getAttribLocation(prog, "a_normal");

        // there are four lights.
        var NUM_LIGHTS = 4;
        prog.uniforms.lights = [];
        for (var i = 0; i < NUM_LIGHTS; i++) {
            var light = {};
            light.position = gl.getUniformLocation(prog, "u_lights["+i+"].pos");
            light.color = gl.getUniformLocation(prog, "u_lights["+i+"].color");
            light.radius = gl.getUniformLocation(prog, "u_lights["+i+"].radius");
            prog.uniforms.lights.push(light);
        }

        return prog;
    }

    var PBRModel = new Class({
        Name: 'PBRModel',
        Extends: BaseModel,

        _buildModel: function() {
            this.parent();
            var gl = this._gl;
            this._renderProgram = createPBRProgram(gl);
        },

        _renderPrologue: function(ctx) {
            this.parent(ctx);
            var gl = this._gl;
            var prog = ctx.currentProgram;

            function setLight(glLight, mLight) {
                gl.uniform3fv(glLight.position, mLight.position);
                gl.uniform3fv(glLight.color, mLight.color);
                gl.uniform1f(glLight.radius, mLight.radius);
            }

            ctx.lights.forEach(function(mLight, i) {
                setLight(prog.uniforms.lights[i], mLight);
            });

            gl.uniform3fv(prog.uniforms.diffuseColor, this._diffuseColor);
            gl.uniform1f(prog.uniforms.roughness, this._roughness);
        },

        setMaterial: function(diffuseColor, roughness) {
            this._diffuseColor = diffuseColor;
            this._roughness = roughness;
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
        Extends: PBRModel,

        _buildModel: function(filename) {
            this.parent();

            var req = fetch(filename);
            this._loaded = false;
            req.onload = function() {
                this._buildModelBuf(req.response);
            }.bind(this);
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
        Extends: PBRModel,

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

            nrmls[0] = 0;
            nrmls[1] = 1;
            nrmls[2] = 0;
            nrmls[3] = 0;
            nrmls[4] = 1;
            nrmls[5] = 0;
            nrmls[6] = 0;
            nrmls[7] = 1;
            nrmls[8] = 0;
            nrmls[9] = 0;
            nrmls[10] = 1;
            nrmls[11] = 0;

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

    var BILLBOARD_VERT_SHADER_SOURCE = M([
        'precision mediump float;',
        '',
        'uniform mat4 u_localMatrix;',
        'uniform mat4 u_viewMatrix;',
        'uniform mat4 u_projection;',
        '',
        'uniform vec3 u_cameraRight;',
        'uniform vec3 u_cameraUp;',
        'uniform vec2 u_size;',
        '',
        'varying vec2 v_position;',
        '',
        'attribute vec3 a_position;',
        '',
        'void main() {',
        '    vec4 mdlPos = u_localMatrix * vec4(0, 0, 0, 1.0);',
        '    vec3 vtxPos = mdlPos.xyz + u_cameraRight*a_position.x*u_size.x + u_cameraUp*a_position.y*u_size.y;',
        '    v_position = a_position.xy;',
        '    gl_Position = u_projection * u_viewMatrix * vec4(vtxPos, 1.0);',
        '}',
    ]);

    var BILLBOARD_FRAG_SHADER_SOURCE = M([
        'precision mediump float;',
        '',
        'uniform vec3 u_color;',
        'varying vec2 v_position;',
        '',
        'void main() {',
        '    float dist = length(v_position);',
        '    if (dist > 1.0) discard;',
        '    gl_FragColor = mix(vec4(u_color, 1.0), vec4(1.0, 1.0, 1.0, 1.0), 1.0 - dist);',
        '}',
    ]);

    function createBillboardProgram(gl) {
        var vertShader = GLUtils.compileShader(gl, BILLBOARD_VERT_SHADER_SOURCE, gl.VERTEX_SHADER);
        var fragShader = GLUtils.compileShader(gl, BILLBOARD_FRAG_SHADER_SOURCE, gl.FRAGMENT_SHADER);

        var prog = gl.createProgram();
        gl.attachShader(prog, vertShader);
        gl.attachShader(prog, fragShader);
        gl.linkProgram(prog);

        prog.uniforms = {};
        prog.uniforms.projection = gl.getUniformLocation(prog, "u_projection");
        prog.uniforms.localMatrix = gl.getUniformLocation(prog, "u_localMatrix");
        prog.uniforms.viewMatrix = gl.getUniformLocation(prog, "u_viewMatrix");
        prog.uniforms.cameraRight = gl.getUniformLocation(prog, "u_cameraRight");
        prog.uniforms.cameraUp = gl.getUniformLocation(prog, "u_cameraUp");
        prog.uniforms.size = gl.getUniformLocation(prog, "u_size");
        prog.uniforms.color = gl.getUniformLocation(prog, "u_color");

        prog.attribs = {};
        prog.attribs.position = gl.getAttribLocation(prog, "a_position");

        return prog;
    }

    var Billboard = new Class({
        Name: 'Billboard',
        Extends: BaseModel,

        _buildModel: function() {
            this.parent();

            var gl = this._gl;

            var verts = new Float32Array(VERT_N_ITEMS * 4);

            verts[0]  = -1;
            verts[1]  = -1;
            verts[2]  = 0;
            verts[3]  = 1;
            verts[4]  = -1;
            verts[5]  = 0;
            verts[6]  = -1;
            verts[7]  = 1;
            verts[8]  = 0;
            verts[9]  = 1;
            verts[10] = 1;
            verts[11] = 0;

            var prim = {};
            prim.color = [0.8, 0.8, 0.8];
            prim.start = 0;
            prim.count = 4;
            prim.drawType = gl.TRIANGLE_STRIP;
            this._primitives.push(prim);

            this._setBuffers(verts, null);

            this._renderProgram = createBillboardProgram(gl);
            this._color = vec3.create();
        },

        _renderPrologue: function(ctx) {
            var gl = this._gl;
            var prog = ctx.currentProgram;
            gl.uniformMatrix4fv(prog.uniforms.projection, false, ctx.projection);

            var mdlMtx = mat4.create();
            this.applyModelMatrix(mdlMtx);
            gl.uniformMatrix4fv(prog.uniforms.localMatrix, false, mdlMtx);

            gl.uniformMatrix4fv(prog.uniforms.viewMatrix, false, ctx.view);

            var cameraRight = [ctx.view[0], ctx.view[4], ctx.view[8]];
            gl.uniform3fv(prog.uniforms.cameraRight, cameraRight);
            var cameraUp = [ctx.view[1], ctx.view[5], ctx.view[9]];
            gl.uniform3fv(prog.uniforms.cameraUp, cameraUp);

            gl.uniform2fv(prog.uniforms.size, [1, 1]);
            gl.uniform3fv(prog.uniforms.color, this._color);

            gl.bindBuffer(gl.ARRAY_BUFFER, this._vertBuffer);
            gl.vertexAttribPointer(prog.attribs.position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(prog.attribs.position);
        },
        _renderEpilogue: function(ctx) {
            var gl = this._gl;
            var prog = ctx.currentProgram;
            gl.disableVertexAttribArray(prog.attribs.position);
        },

        setPosition: function(pos) {
            mat4.fromTranslation(this.localMatrix, pos);
        },
        setColor: function(color) {
            vec3.copy(this._color, color);
        },
    });
    Models.Billboard = Billboard;

    exports.Models = Models;

})(window);
