// Contains all the models in the scene, and shader code.

(function(exports) {
    "use strict";

    const Models = {};

    const TAU = Math.PI * 2;

    const VERT_N_ITEMS = 3;
    const VERT_N_BYTES = VERT_N_ITEMS * Float32Array.BYTES_PER_ELEMENT;

    class RenderContext {
        constructor(gl) {
            this._gl = gl;

            this.currentProgram = null;
            this.forceMaterial = false;
        }
        setProgram(prog) {
            const gl = this._gl;

            this.currentProgram = prog;
            gl.useProgram(this.currentProgram);
        }
        setMaterial(material) {
            if (this.forceMaterial)
                return;

            material.renderPrologue(this);
        }
    }

    // The main renderer.
    class Scene {
        constructor(gl) {
            this._gl = gl;

            this._view = mat4.create();

            this._projection = mat4.create();
            mat4.perspective(this._projection, Math.PI / 4, gl.viewportWidth / gl.viewportHeight, 0.2, 256);

            this._renderCtx = new RenderContext(gl);
            this._renderCtx.view = this._view;
            this._renderCtx.projection = this._projection;

            this.models = [];
        }

        setCamera(mat) {
            mat4.copy(this._view, mat);
        }
        setLights(lights) {
            this._renderCtx.lights = lights;
        }

        attachModel(model) {
            this.models.push(model);
        }

        _render() {
            const gl = this._gl;
            const ctx = this._renderCtx;

            // Shadow map.
            ctx.lights.forEach(function(light) {
                light.renderShadowMapPrologue(ctx);

                ctx.forceMaterial = true;
                this.models.forEach(function(model) {
                    if (model.castsShadow)
                        model.render(this._renderCtx);
                }.bind(this));
                ctx.forceMaterial = false;

                light.renderShadowMapEpilogue();
            }.bind(this));

            // Normal render.
            gl.enable(gl.DEPTH_TEST);
            gl.clearColor(0.88, 0.88, 0.88, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.cullFace(gl.BACK);

            gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

            this.models.forEach(function(model) {
                model.render(ctx);
            }.bind(this));
        }
        update() {
            this._render();
        }
    }
    Models.Scene = Scene;

    function createShadowMapProgram(gl) {
        const prog = GLUtils.compileProgram(gl,
// Common 
`
precision mediump float;

uniform mat4 u_localMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projection;
`,
// Vert
`
attribute vec3 a_position;

void main() {
    vec4 positionWorld = u_localMatrix * vec4(a_position, 1.0);
    vec4 positionEye = u_viewMatrix * positionWorld;
    gl_Position = u_projection * positionEye;
}
`,
// Frag
`
void main() {
    float depth = (gl_FragCoord.z / gl_FragCoord.w) * 0.005;
    gl_FragColor = vec4(depth, 0.0, 0.0, 1.0);
}
`);
        prog.uniforms = {};
        prog.uniforms.projection = gl.getUniformLocation(prog, "u_projection");
        prog.uniforms.localMatrix = gl.getUniformLocation(prog, "u_localMatrix");
        prog.uniforms.viewMatrix = gl.getUniformLocation(prog, "u_viewMatrix");

        prog.attribs = {};
        prog.attribs.position = gl.getAttribLocation(prog, "a_position");

        return prog;
    }

    const SHADOW_MAP_SIZE = 512;
    class Light {
        constructor(gl, position, color, intensity, radius) {
            this._gl = gl;

            this.position = position;
            this.color = color;
            this.intensity = intensity;
            this.radius = radius;

            const depthTexture = gl.getExtension('WEBGL_depth_texture');

            this._shadowMapColor = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this._shadowMapColor);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            const d = true;
            if (d) {
                this._shadowMapDepth = gl.createRenderbuffer();
                gl.bindRenderbuffer(gl.RENDERBUFFER, this._shadowMapDepth);
                gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
            } else {
                this._shadowMapDepth = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, this._shadowMapDepth);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            }

            this._shadowMapFramebuffer = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._shadowMapFramebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._shadowMapColor, 0);
            if (d) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this._shadowMapDepth);
            else gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this._shadowMapDepth, 0);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);

            this._shadowMapProgram = createShadowMapProgram(gl);

            this._shadowMapProjection = mat4.create();
            mat4.perspective(this._shadowMapProjection, Math.PI / 2, 1.0, 1.0, 256.0);

            this._shadowMapView = mat4.create();
        }

        renderShadowMapPrologue(ctx) {
            const gl = this._gl;
            ctx.setProgram(this._shadowMapProgram);

            gl.bindFramebuffer(gl.FRAMEBUFFER, this._shadowMapFramebuffer);
            gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            gl.cullFace(gl.FRONT);

            const prog = ctx.currentProgram;
            gl.uniformMatrix4fv(prog.uniforms.projection, false, this._shadowMapProjection);

            const pos = this.position;
            mat4.identity(this._shadowMapView);
            mat4.rotateX(this._shadowMapView, this._shadowMapView, Math.PI / 2);
            mat4.translate(this._shadowMapView, this._shadowMapView, [-pos[0], -pos[1], -pos[2]]);
            gl.uniformMatrix4fv(prog.uniforms.viewMatrix, false, this._shadowMapView);
        }

        renderShadowMapEpilogue() {
            const gl = this._gl;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
    }
    Models.Light = Light;

    class Group {
        constructor() {
            this.children = [];
            this.localMatrix = mat4.create();
            this.castsShadow = true;
        }

        render(ctx) {
            this.forEach(function(mdl) {
                mdl.render(ctx);
            });
        }

        attachModel(model) {
            this.children.push(model);
            model.parentGroup = this;
        }

        applyModelMatrix(mtx) {
            if (this.parentGroup)
                this.parentGroup.applyModelMatrix(mtx);

            mat4.multiply(mtx, mtx, this.localMatrix);
        }

        forEach(cb) {
            this.children.forEach(cb);
        }
    }
    Models.Group = Group;

    class BaseModel {
        constructor(gl) {
            this._gl = gl;

            this._renderProgram = null;
            this._primitives = [];
            this.localMatrix = mat4.create();

            this.castsShadow = true;

            const args = [].slice.call(arguments, 1);
            this._buildModel.apply(this, args);
        }

        applyModelMatrix(mtx) {
            if (this.parentGroup)
                this.parentGroup.applyModelMatrix(mtx);

            mat4.multiply(mtx, mtx, this.localMatrix);
        }

        _buildModel() {
        }

        _setBuffers(verts, nrmls) {
            const gl = this._gl;

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
        }

        _renderPrologue(ctx) {
            const gl = this._gl;

            const prog = ctx.currentProgram;

            const mdlMtx = mat4.create();
            this.applyModelMatrix(mdlMtx);
            gl.uniformMatrix4fv(prog.uniforms.localMatrix, false, mdlMtx);
            const mtx = mat4.create();

            mat4.multiply(mtx, ctx.view, mdlMtx);
            mat4.invert(mtx, mtx);
            mat4.transpose(mtx, mtx);
            gl.uniformMatrix4fv(prog.uniforms.normalMatrix, false, mtx);

            gl.bindBuffer(gl.ARRAY_BUFFER, this._vertBuffer);
            gl.vertexAttribPointer(prog.attribs.position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(prog.attribs.position);

            if (prog.attribs.normal) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this._nrmlBuffer);
                gl.vertexAttribPointer(prog.attribs.normal, 3, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(prog.attribs.normal);
            }
        }
        _renderEpilogue(ctx) {
            const gl = this._gl;
            const prog = ctx.currentProgram;
            gl.disableVertexAttribArray(prog.attribs.position);
            if (prog.attribs.normal)
                gl.disableVertexAttribArray(prog.attribs.normal);
        }
        _renderPrimitive(ctx, prim) {
            const gl = this._gl;
            gl.drawArrays(prim.drawType, prim.start, prim.count);
        }

        setMaterial(material) {
            this._material = material;  
        }

        render(ctx) {
            if (this._loaded === false)
                return;

            ctx.setMaterial(this._material);
            this._renderPrologue(ctx);
            this._primitives.forEach(function(prim) {
                this._renderPrimitive(ctx, prim);
            }.bind(this));
            this._renderEpilogue(ctx);
        }
    }

    function createPBRProgram(gl) {
        const prog = GLUtils.compileProgram(gl,
// Common 
`
precision mediump float;

uniform mat4 u_localMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_normalMatrix;
uniform mat4 u_projection;

struct Light {
    vec3 pos, color;
    float radius, intensity;
    mat4 view, projection;
};

struct Material {
    float roughness;
    vec3 diffuseColor;
};

uniform Material u_material;

#define NUM_LIGHTS 4
uniform Light u_lights[NUM_LIGHTS];
// Workaround ANGLE not supporting samplers in structs...
uniform sampler2D u_lights_shadowMap[NUM_LIGHTS];

varying vec4 v_positionWorld;
varying vec4 v_positionEye;
varying vec4 v_normalEye;
varying vec2 v_uv;
`,
// Vert
`
attribute vec3 a_position;
attribute vec3 a_normal;

void main() {
    v_positionWorld = u_localMatrix * vec4(a_position, 1.0);
    v_positionEye = u_viewMatrix * v_positionWorld;
    v_normalEye = u_normalMatrix * vec4(a_normal, 1.0);
    gl_Position = u_projection * v_positionEye;
    v_uv = (a_position.xz + 1.0) / 2.0;
}
`,
`
float attenuate(const in Light light, const in float dist) {
    float att = clamp(1.0 - dist/light.radius, 0.0, 1.0);
    return att * att;
}

vec3 brdf_F_Schlick(const in vec3 L, const in vec3 H, const in vec3 specularColor) {
    float LoH = clamp(dot(L, H), 0.0, 1.0);
    float fresnel = pow(1.0 - LoH, 5.0);
    return (1.0 - fresnel) * specularColor + fresnel;
}

float brdf_G_GGX_Smith(const in vec3 N, const in vec3 L, const in vec3 V, const in float roughness) {
    // GGX / Smith from s2013_pbs_epic_notes_v2.pdf
    float alpha = roughness * roughness;
    float k = alpha * 0.5;

    float NoL = clamp(dot(N, L), 0.0, 1.0);
    float NoV = clamp(dot(N, V), 0.0, 1.0);
    float G1L = 1.0 / (NoL * (1.0 - k) + k);
    float G1V = 1.0 / (NoV * (1.0 - k) + k);
    return (G1L * G1V) / (4.0);
}

float brdf_D_GGX(const in vec3 N, const in vec3 H, const in float roughness) {
    // Use the Disney GGX/Troughbridge-Reitz. Stolen from s2013_pbs_epic_notes_v2.pdf
    float alpha = roughness * roughness;
    float alpha2 = alpha * alpha;
    float NoH = clamp(dot(N, H), 0.0, 1.0);
    float denom = ((NoH * NoH) * (alpha2 - 1.0)) + 1.0;
    return alpha2 / (denom * denom);
}

vec3 brdf_Specular_GGX(const in vec3 N, const in vec3 L, const in vec3 V, const in float roughness) {
    vec3 H = normalize(L + V);
    vec3 F = brdf_F_Schlick(L, H, vec3(0.04, 0.04, 0.04));
    float G = brdf_G_GGX_Smith(N, L, V, roughness);
    float D = brdf_D_GGX(N, H, roughness);
    return F * G * D;
}

float light_getShadow(const in Light light, sampler2D shadowMap) {
    const mat4 depthScaleMatrix = mat4(0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 0.5, 1.0);
    vec4 lightWorldPos = light.view * v_positionWorld;
    vec4 lightEyePos = depthScaleMatrix * light.projection * lightWorldPos;
    vec3 lightDevice = (lightEyePos.xyz / lightEyePos.w);
    float shadowBias = 0.008;
    float lightDepth = texture2D(shadowMap, lightDevice.xy).r;
    float normalDepth = (lightEyePos.w * 0.005) - shadowBias;
    return step(normalDepth, lightDepth);
}

vec3 light_getReflectedLight(const in Light light, sampler2D shadowMap) {
    if (light.radius <= 1.0) return vec3(0.0);

    vec3 lightPosEye = (u_viewMatrix * vec4(light.pos, 1.0)).xyz;
    vec3 lightToModel = lightPosEye - v_positionEye.xyz;
    vec3 lightColor = light.color * light.intensity * attenuate(light, length(lightToModel));

    vec3 L = normalize(lightToModel);
    vec3 N = normalize(v_normalEye.xyz);
    vec3 V = normalize(-v_positionEye.xyz);

    float NoL = clamp(dot(N, L), 0.0, 1.0);
    vec3 diffuse = u_material.diffuseColor;
    vec3 specular = brdf_Specular_GGX(N, L, V, u_material.roughness);
    vec3 directIrradiance = lightColor * NoL;

    // Technically not energy-conserving, since we add the same light
    // for both specular and diffuse, but it\'s minimal so we don\'t care...
    vec3 outgoingLight = (directIrradiance * diffuse) + (directIrradiance * specular);
    return outgoingLight * light_getShadow(light, shadowMap);
}

void main() {
    vec3 directReflectedLight = vec3(0.0);

    for (int i = 0; i < NUM_LIGHTS; i++) {
        directReflectedLight += light_getReflectedLight(u_lights[i], u_lights_shadowMap[i]);
    }

    vec3 indirectDiffuseIrradiance = vec3(0.5);
    vec3 indirectReflectedLight = indirectDiffuseIrradiance * u_material.diffuseColor;
    vec3 dcol = directReflectedLight + indirectReflectedLight;

    vec3 color = pow(dcol, vec3(1.0/2.2));

    gl_FragColor = vec4(color, 1.0);
}
`);

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
        const NUM_LIGHTS = 4;
        prog.uniforms.lights = [];
        for (let i = 0; i < NUM_LIGHTS; i++) {
            const light = {};
            light.position = gl.getUniformLocation(prog, "u_lights["+i+"].pos");
            light.color = gl.getUniformLocation(prog, "u_lights["+i+"].color");
            light.radius = gl.getUniformLocation(prog, "u_lights["+i+"].radius");
            light.intensity = gl.getUniformLocation(prog, "u_lights["+i+"].intensity");
            light.projection = gl.getUniformLocation(prog, "u_lights["+i+"].projection");
            light.view = gl.getUniformLocation(prog, "u_lights["+i+"].view");
            light.shadowMap = gl.getUniformLocation(prog, "u_lights_shadowMap["+i+"]");
            prog.uniforms.lights.push(light);
        }

        return prog;
    }

    class PBRMaterial {
        constructor(gl) {
            this._gl = gl;
            this._renderProgram = createPBRProgram(gl);

            const args = [].slice.call(arguments, 1);
            this.set.apply(this, args);
        }

        renderPrologue(ctx) {
            const gl = this._gl;

            ctx.setProgram(this._renderProgram);
            const prog = ctx.currentProgram;

            gl.uniformMatrix4fv(prog.uniforms.projection, false, ctx.projection);
            gl.uniformMatrix4fv(prog.uniforms.viewMatrix, false, ctx.view);

            function setLight(glLight, mLight, i) {
                gl.uniform3fv(glLight.position, mLight.position);
                gl.uniform3fv(glLight.color, mLight.color);
                gl.uniform1f(glLight.intensity, mLight.intensity);
                gl.uniform1f(glLight.radius, mLight.radius);

                gl.activeTexture(gl.TEXTURE0 + i);
                gl.bindTexture(gl.TEXTURE_2D, mLight._shadowMapColor);
                gl.uniform1i(glLight.shadowMap, i);

                gl.uniformMatrix4fv(glLight.projection, false, mLight._shadowMapProjection);
                gl.uniformMatrix4fv(glLight.view, false, mLight._shadowMapView);
            }

            ctx.lights.forEach(function(mLight, i) {
                setLight(prog.uniforms.lights[i], mLight, i);
            });

            gl.uniform3fv(prog.uniforms.diffuseColor, this._diffuseColor);
            gl.uniform1f(prog.uniforms.roughness, this._roughness);
        }

        set(diffuseColor, roughness) {
            this._diffuseColor = diffuseColor;
            this._roughness = roughness;
        }
    }
    Models.PBRMaterial = PBRMaterial;

    function fetch(path) {
        const request = new XMLHttpRequest();
        request.open("GET", path, true);
        request.responseType = "arraybuffer";
        // request.overrideMimeType('text/plain');
        request.send();
        return request;
    }

    class JMDL extends BaseModel {
        _buildModel(filename) {
            super._buildModel();

            const req = fetch(filename);
            this._loaded = false;
            req.onload = function() {
                this._buildModelBuf(req.response);
            }.bind(this);
        }
        _buildModelBuf(buffer) {
            const gl = this._gl;

            const view = new DataView(buffer);

            let offs = 0;
            function req(match) {
                const buf = new Uint8Array(buffer, offs, match.length);
                for (let i = 0; i < match.length; i++) {
                    const elem = buf[i];
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
            const nface = int();

            req('JVTX');
            const verts = new Float32Array(buffer, offs, 3 * 3 * nface);
            offs += 4 * 3 * 3 * nface;

            req('JNRM');
            const norms = new Float32Array(buffer, offs, 3 * 3 * nface);
            offs += 4 * 3 * 3 * nface;

            const prim = {};
            prim.start = 0;
            prim.count = nface * 3;
            prim.drawType = gl.TRIANGLES;
            this._primitives.push(prim);

            this._setBuffers(verts, norms);
        }
    }
    Models.JMDL = JMDL;

    class Plane extends BaseModel {
        _buildModel() {
            super._buildModel();

            const gl = this._gl;

            const verts = new Float32Array(VERT_N_ITEMS * 4);
            const nrmls = new Float32Array(VERT_N_ITEMS * 4);

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

            const prim = {};
            prim.start = 0;
            prim.count = 4;
            prim.drawType = gl.TRIANGLE_STRIP;
            this._primitives.push(prim);

            this._setBuffers(verts, nrmls);
        }
    }
    Models.Plane = Plane;

    function createBillboardProgram(gl) {
        const prog = GLUtils.compileProgram(gl,
// Common
`
precision mediump float;

uniform mat4 u_localMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projection;

uniform vec2 u_size;
uniform vec3 u_color;

varying vec2 v_position;
`,
// Vert
`
attribute vec3 a_position;

void main() {
    vec4 mdlPos = u_localMatrix * vec4(0, 0, 0, 1.0);
    vec3 cameraRight = (vec4(1.0, 0.0, 0.0, 0.0) * u_viewMatrix).xyz;
    vec3 cameraUp    = (vec4(0.0, 1.0, 0.0, 0.0) * u_viewMatrix).xyz;
    vec3 vtxPos = mdlPos.xyz + cameraRight*a_position.x*u_size.x + cameraUp*a_position.y*u_size.y;
    v_position = a_position.xy;
    gl_Position = u_projection * u_viewMatrix * vec4(vtxPos, 1.0);
}
`,
// Frag
`
void main() {
    float dist = length(v_position);
    if (dist > 1.0) discard;
    gl_FragColor = mix(vec4(u_color, 1.0), vec4(1.0, 1.0, 1.0, 1.0), 1.0 - dist);
}
`);

        prog.uniforms = {};
        prog.uniforms.projection = gl.getUniformLocation(prog, "u_projection");
        prog.uniforms.localMatrix = gl.getUniformLocation(prog, "u_localMatrix");
        prog.uniforms.viewMatrix = gl.getUniformLocation(prog, "u_viewMatrix");
        prog.uniforms.size = gl.getUniformLocation(prog, "u_size");
        prog.uniforms.color = gl.getUniformLocation(prog, "u_color");

        prog.attribs = {};
        prog.attribs.position = gl.getAttribLocation(prog, "a_position");

        return prog;
    }

    class BillboardMaterial {
        constructor(gl) {
            this._gl = gl;
            this._renderProgram = createBillboardProgram(gl);
            this._color = vec3.create();
        }

        renderPrologue(ctx) {
            const gl = this._gl;

            ctx.setProgram(this._renderProgram);
            const prog = ctx.currentProgram;

            gl.uniformMatrix4fv(prog.uniforms.projection, false, ctx.projection);
            gl.uniformMatrix4fv(prog.uniforms.viewMatrix, false, ctx.view);

            gl.uniform2fv(prog.uniforms.size, [1, 1]);
            gl.uniform3fv(prog.uniforms.color, this._color);
        }

        setColor(color) {
            vec3.copy(this._color, color);
        }
    }

    class Billboard extends BaseModel {
        _buildModel() {
            super._buildModel();

            const gl = this._gl;

            const verts = new Float32Array(VERT_N_ITEMS * 4);

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

            const prim = {};
            prim.start = 0;
            prim.count = 4;
            prim.drawType = gl.TRIANGLE_STRIP;
            this._primitives.push(prim);

            this._setBuffers(verts, null);

            this.setMaterial(new BillboardMaterial(gl));

            this.castsShadow = false;
        }

        _renderPrologue(ctx) {
            const gl = this._gl;
            const prog = ctx.currentProgram;

            gl.bindBuffer(gl.ARRAY_BUFFER, this._vertBuffer);
            gl.vertexAttribPointer(prog.attribs.position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(prog.attribs.position);

            const mdlMtx = mat4.create();
            this.applyModelMatrix(mdlMtx);
            gl.uniformMatrix4fv(prog.uniforms.localMatrix, false, mdlMtx);
        }
        _renderEpilogue(ctx) {
            const gl = this._gl;
            const prog = ctx.currentProgram;
            gl.disableVertexAttribArray(prog.attribs.position);
        }

        setPosition(pos) {
            mat4.fromTranslation(this.localMatrix, pos);
        }
        setColor(color) {
            this._material.setColor(color);
        }
    }
    Models.Billboard = Billboard;

    exports.Models = Models;

})(window);
