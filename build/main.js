var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spread = (this && this.__spread) || function () {
    for (var ar = [], i = 0; i < arguments.length; i++) ar = ar.concat(__read(arguments[i]));
    return ar;
};
var __values = (this && this.__values) || function (o) {
    var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
    if (m) return m.call(o);
    return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
};
System.register("models", ["gl-matrix"], function (exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var gl_matrix_1, TAU, VERT_N_ITEMS, VERT_N_BYTES, Program, ModelProgram, Viewport, RenderState, Camera, Scene, PassFramebuffer, PostPassProgram, PostPassProgram_Vignette, PostPassProgram_ChromaAberration, PostPass, Renderer, ShadowMapProgram, SHADOW_MAP_SIZE, PointLight, Group, BaseModel, PBRMaterial, JMDL, Plane, LightBillboardMaterial, LightBillboard;
    return {
        setters: [
            function (gl_matrix_1_1) {
                gl_matrix_1 = gl_matrix_1_1;
            }
        ],
        execute: function () {
            TAU = Math.PI * 2;
            VERT_N_ITEMS = 3;
            VERT_N_BYTES = VERT_N_ITEMS * Float32Array.BYTES_PER_ELEMENT;
            Program = /** @class */ (function () {
                function Program() {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    this.loaded = false;
                    this.set.apply(this, __spread(args));
                }
                Program.prototype.set = function () {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                };
                Program.prototype.compileShader = function (gl, str, type) {
                    var shader = gl.createShader(type);
                    gl.shaderSource(shader, str);
                    gl.compileShader(shader);
                    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                        console.error(str);
                        console.error(gl.getShaderInfoLog(shader));
                        return null;
                    }
                    return shader;
                };
                Program.prototype.compileShaders = function (gl, prog, fullVert, fullFrag) {
                    var vertShader = this.compileShader(gl, fullVert, gl.VERTEX_SHADER);
                    var fragShader = this.compileShader(gl, fullFrag, gl.FRAGMENT_SHADER);
                    gl.attachShader(prog, vertShader);
                    gl.attachShader(prog, fragShader);
                    gl.linkProgram(prog);
                };
                Program.prototype.compileProgramFromStr = function (gl, prog, str) {
                    var vertHeader = '#version 300 es\n#define VERT 1\n#define vert_main main\n#define varying out';
                    var fragHeader = '#version 300 es\n#define FRAG 1\n#define frag_main main\n#define varying in';
                    var fullVert = vertHeader + str;
                    var fullFrag = fragHeader + str;
                    this.compileShaders(gl, prog, fullVert, fullFrag);
                    this.bind(gl, prog);
                };
                Program.prototype._fetch = function (path) {
                    var request = new XMLHttpRequest();
                    request.open("GET", "src/" + path, true);
                    request.overrideMimeType('text/plain');
                    request.send();
                    return request;
                };
                Program.prototype.compileProgramFromURL = function (gl, prog, filename) {
                    var _this = this;
                    var req = this._fetch(filename);
                    req.onload = function () {
                        _this.compileProgramFromStr(gl, prog, req.responseText);
                    };
                };
                Program.prototype.bind = function (gl, prog) {
                    this.loaded = true;
                };
                Program.prototype.load = function (gl) {
                    if (this.loaded)
                        return true;
                    if (this.glProg)
                        return false;
                    this.glProg = gl.createProgram();
                    this.compileProgram(gl, this.glProg);
                    return false;
                };
                Program.prototype.getProgram = function () {
                    return this.glProg;
                };
                return Program;
            }());
            ModelProgram = /** @class */ (function (_super) {
                __extends(ModelProgram, _super);
                function ModelProgram() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                ModelProgram.prototype.bind = function (gl, prog) {
                    _super.prototype.bind.call(this, gl, prog);
                    this.u_projection = gl.getUniformLocation(prog, "u_projection");
                    this.u_viewMatrix = gl.getUniformLocation(prog, "u_viewMatrix");
                };
                return ModelProgram;
            }(Program));
            Viewport = /** @class */ (function () {
                function Viewport(canvas) {
                    this.canvas = canvas;
                    this.gl = canvas.getContext("webgl2", { alpha: false });
                }
                Object.defineProperty(Viewport.prototype, "width", {
                    get: function () {
                        return this.canvas.width;
                    },
                    enumerable: true,
                    configurable: true
                });
                Object.defineProperty(Viewport.prototype, "height", {
                    get: function () {
                        return this.canvas.height;
                    },
                    enumerable: true,
                    configurable: true
                });
                return Viewport;
            }());
            exports_1("Viewport", Viewport);
            RenderState = /** @class */ (function () {
                function RenderState(viewport) {
                    this.currentProgram = null;
                    this.forceMaterial = false;
                    this.viewport = viewport;
                    this.gl = this.viewport.gl;
                    this.time = 0;
                }
                RenderState.prototype.useProgram = function (prog) {
                    var gl = this.gl;
                    this.currentProgram = prog;
                    gl.useProgram(prog.getProgram());
                };
                RenderState.prototype.useMaterial = function (material, scene) {
                    if (this.forceMaterial)
                        return;
                    material.renderPrologue(this, scene);
                    scene.camera.renderPrologue(this, scene);
                };
                return RenderState;
            }());
            exports_1("RenderState", RenderState);
            Camera = /** @class */ (function () {
                function Camera() {
                    this.projection = gl_matrix_1.mat4.create();
                    this.view = gl_matrix_1.mat4.create();
                }
                Camera.prototype.checkResize = function (renderState, scene) {
                    var viewport = renderState.viewport;
                    var aspect = viewport.width / viewport.height;
                    gl_matrix_1.mat4.perspective(this.projection, Math.PI / 4, aspect, 0.2, 50000);
                };
                Camera.prototype.renderPrologue = function (renderState, scene) {
                    var gl = renderState.gl;
                    var prog = renderState.currentProgram;
                    gl.uniformMatrix4fv(prog.u_projection, false, this.projection);
                    gl.uniformMatrix4fv(prog.u_viewMatrix, false, this.view);
                };
                return Camera;
            }());
            exports_1("Camera", Camera);
            // A Scene is a declaration of every entity in the scene graph.
            Scene = /** @class */ (function () {
                function Scene() {
                    this.lights = [];
                    this.models = [];
                }
                return Scene;
            }());
            exports_1("Scene", Scene);
            PassFramebuffer = /** @class */ (function () {
                function PassFramebuffer() {
                    this.scale = 1.0;
                    this.needsDepth = false;
                }
                PassFramebuffer.prototype.recreate = function (renderState, needsDepth) {
                    var gl = renderState.gl;
                    var width = renderState.viewport.width * this.scale;
                    var height = renderState.viewport.height * this.scale;
                    if (this.width !== undefined && this.width === width && this.height === height && this.needsDepth == needsDepth)
                        return;
                    this.width = width;
                    this.height = height;
                    this.needsDepth = needsDepth;
                    if (this.msaaFramebuffer) {
                        gl.deleteFramebuffer(this.msaaFramebuffer);
                        gl.deleteFramebuffer(this.resolveFramebuffer);
                        gl.deleteTexture(this.colorTex);
                        gl.deleteRenderbuffer(this.colorRenderbuffer);
                        if (this.depthRenderbuffer)
                            gl.deleteRenderbuffer(this.depthRenderbuffer);
                    }
                    var samples = 4;
                    this.colorRenderbuffer = gl.createRenderbuffer();
                    gl.bindRenderbuffer(gl.RENDERBUFFER, this.colorRenderbuffer);
                    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);
                    if (this.needsDepth) {
                        this.depthRenderbuffer = gl.createRenderbuffer();
                        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRenderbuffer);
                        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT16, width, height);
                    }
                    this.msaaFramebuffer = gl.createFramebuffer();
                    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFramebuffer);
                    gl.framebufferRenderbuffer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.colorRenderbuffer);
                    if (this.needsDepth) {
                        gl.framebufferRenderbuffer(gl.READ_FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRenderbuffer);
                    }
                    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
                    this.colorTex = gl.createTexture();
                    gl.bindTexture(gl.TEXTURE_2D, this.colorTex);
                    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    this.resolveFramebuffer = gl.createFramebuffer();
                    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolveFramebuffer);
                    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTex, 0);
                    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
                };
                PassFramebuffer.prototype.setActive = function (renderState) {
                    var gl = renderState.gl;
                    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.msaaFramebuffer);
                    gl.viewport(0, 0, this.width, this.height);
                };
                PassFramebuffer.prototype.blit = function (renderState) {
                    var gl = renderState.gl;
                    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFramebuffer);
                    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolveFramebuffer);
                    gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
                    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
                    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
                };
                return PassFramebuffer;
            }());
            PostPassProgram = /** @class */ (function (_super) {
                __extends(PostPassProgram, _super);
                function PostPassProgram() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                PostPassProgram.prototype.bind = function (gl, prog) {
                    _super.prototype.bind.call(this, gl, prog);
                    this.u_tex = gl.getUniformLocation(prog, 'u_tex');
                    this.a_position = gl.getAttribLocation(prog, 'a_position');
                    this.a_uv = gl.getAttribLocation(prog, 'a_uv');
                };
                return PostPassProgram;
            }(Program));
            PostPassProgram_Vignette = /** @class */ (function (_super) {
                __extends(PostPassProgram_Vignette, _super);
                function PostPassProgram_Vignette() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                PostPassProgram_Vignette.prototype.compileProgram = function (gl, prog) {
                    this.compileProgramFromURL(gl, prog, 'fx_PostVignette.glsl');
                };
                return PostPassProgram_Vignette;
            }(PostPassProgram));
            exports_1("PostPassProgram_Vignette", PostPassProgram_Vignette);
            PostPassProgram_ChromaAberration = /** @class */ (function (_super) {
                __extends(PostPassProgram_ChromaAberration, _super);
                function PostPassProgram_ChromaAberration() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                PostPassProgram_ChromaAberration.prototype.compileProgram = function (gl, prog) {
                    this.compileProgramFromURL(gl, prog, 'fx_PostChromaAberration.glsl');
                };
                return PostPassProgram_ChromaAberration;
            }(PostPassProgram));
            exports_1("PostPassProgram_ChromaAberration", PostPassProgram_ChromaAberration);
            PostPass = /** @class */ (function () {
                function PostPass(program) {
                    this.program = program;
                    this.framebuffer = new PassFramebuffer();
                }
                PostPass.prototype.setBuffers = function (renderState) {
                    if (this.vertBuffer)
                        return;
                    var vtx = new Float32Array(6);
                    vtx[0] = -1.0;
                    vtx[1] = -1.0;
                    vtx[2] = 3.0;
                    vtx[3] = -1.0;
                    vtx[4] = -1.0;
                    vtx[5] = 3.0;
                    var gl = renderState.gl;
                    this.vertBuffer = gl.createBuffer();
                    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
                    gl.bufferData(gl.ARRAY_BUFFER, vtx, gl.STATIC_DRAW);
                    var uv = new Float32Array(6);
                    uv[0] = 0.0;
                    uv[1] = 0.0;
                    uv[2] = 2.0;
                    uv[3] = 0.0;
                    uv[4] = 0.0;
                    uv[5] = 2.0;
                    this.uvBuffer = gl.createBuffer();
                    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
                    gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
                };
                PostPass.prototype.bind = function (renderState) {
                    this.setBuffers(renderState);
                };
                PostPass.prototype.load = function (renderState) {
                    return this.program.load(renderState.gl);
                };
                PostPass.prototype.drawQuad = function (renderState) {
                    var gl = renderState.gl;
                    renderState.useProgram(this.program);
                    gl.disable(gl.DEPTH_TEST);
                    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
                    gl.vertexAttribPointer(this.program.a_position, 2, gl.FLOAT, false, 0, 0);
                    gl.enableVertexAttribArray(this.program.a_position);
                    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
                    gl.vertexAttribPointer(this.program.a_uv, 2, gl.FLOAT, false, 0, 0);
                    gl.enableVertexAttribArray(this.program.a_uv);
                    gl.uniform1i(this.program.u_tex, 0);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                };
                return PostPass;
            }());
            exports_1("PostPass", PostPass);
            Renderer = /** @class */ (function () {
                function Renderer(viewport) {
                    this.postPasses = [];
                    this.renderState = new RenderState(viewport);
                }
                Renderer.prototype.render = function (scene) {
                    var gl = this.renderState.gl;
                    var renderState = this.renderState;
                    // Load our post passes.
                    var postPasses = this.postPasses.filter(function (postPass) { return postPass.load(renderState); });
                    for (var i = 0; i < postPasses.length; i++) {
                        var postPass = postPasses[i];
                        postPass.bind(renderState);
                        postPass.framebuffer.recreate(renderState, i === 0);
                    }
                    try {
                        // Shadow maps.
                        for (var _a = __values(scene.lights), _b = _a.next(); !_b.done; _b = _a.next()) {
                            var light = _b.value;
                            if (!light.renderShadowMapPrologue(renderState, scene))
                                continue;
                            renderState.forceMaterial = true;
                            try {
                                for (var _c = __values(scene.models), _d = _c.next(); !_d.done; _d = _c.next()) {
                                    var model = _d.value;
                                    if (model.castsShadow)
                                        model.render(renderState, scene);
                                }
                            }
                            catch (e_1_1) { e_1 = { error: e_1_1 }; }
                            finally {
                                try {
                                    if (_d && !_d.done && (_e = _c.return)) _e.call(_c);
                                }
                                finally { if (e_1) throw e_1.error; }
                            }
                            renderState.forceMaterial = false;
                            light.renderShadowMapEpilogue(renderState, scene);
                        }
                    }
                    catch (e_2_1) { e_2 = { error: e_2_1 }; }
                    finally {
                        try {
                            if (_b && !_b.done && (_f = _a.return)) _f.call(_a);
                        }
                        finally { if (e_2) throw e_2.error; }
                    }
                    // "Normal" render.
                    // Set up our first post pass, if we have any.
                    gl.viewport(0, 0, this.renderState.viewport.width, this.renderState.viewport.height);
                    if (postPasses[0]) {
                        postPasses[0].framebuffer.setActive(renderState);
                    }
                    scene.camera.checkResize(renderState, scene);
                    gl.enable(gl.DEPTH_TEST);
                    gl.clearColor(0.88, 0.88, 0.88, 1);
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                    gl.cullFace(gl.BACK);
                    try {
                        for (var _g = __values(scene.models), _h = _g.next(); !_h.done; _h = _g.next()) {
                            var model = _h.value;
                            model.render(renderState, scene);
                        }
                    }
                    catch (e_3_1) { e_3 = { error: e_3_1 }; }
                    finally {
                        try {
                            if (_h && !_h.done && (_j = _g.return)) _j.call(_g);
                        }
                        finally { if (e_3) throw e_3.error; }
                    }
                    // Full-screen post passes.
                    for (var i = 0; i < postPasses.length; i++) {
                        var curPass = postPasses[i];
                        var nextPass = postPasses[i + 1];
                        curPass.framebuffer.blit(renderState);
                        if (nextPass) {
                            nextPass.framebuffer.setActive(renderState);
                        }
                        else {
                            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
                            gl.viewport(0, 0, this.renderState.viewport.width, this.renderState.viewport.height);
                        }
                        gl.activeTexture(gl.TEXTURE0 + 0);
                        gl.bindTexture(gl.TEXTURE_2D, curPass.framebuffer.colorTex);
                        curPass.drawQuad(renderState);
                    }
                    var e_2, _f, e_1, _e, e_3, _j;
                };
                return Renderer;
            }());
            exports_1("Renderer", Renderer);
            ShadowMapProgram = /** @class */ (function (_super) {
                __extends(ShadowMapProgram, _super);
                function ShadowMapProgram() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                ShadowMapProgram.prototype.compileProgram = function (gl, prog) {
                    return this.compileProgramFromURL(gl, prog, 'fx_ShadowMap.glsl');
                };
                ShadowMapProgram.prototype.bind = function (gl, prog) {
                    _super.prototype.bind.call(this, gl, prog);
                    this.u_localMatrix = gl.getUniformLocation(prog, 'u_localMatrix');
                    this.a_position = gl.getAttribLocation(prog, 'a_position');
                };
                return ShadowMapProgram;
            }(ModelProgram));
            SHADOW_MAP_SIZE = 1024;
            PointLight = /** @class */ (function () {
                function PointLight(gl, position, color, intensity, radius) {
                    this.position = position;
                    this.color = color;
                    this.intensity = intensity;
                    this.radius = radius;
                    this.shadowMapDepth = gl.createTexture();
                    gl.bindTexture(gl.TEXTURE_2D, this.shadowMapDepth);
                    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT16, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
                    this.shadowMapFramebuffer = gl.createFramebuffer();
                    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowMapFramebuffer);
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowMapDepth, 0);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                    this.shadowMapProgram = new ShadowMapProgram();
                    // TODO(jstpierre): Use Camera
                    this.shadowMapProjection = gl_matrix_1.mat4.create();
                    gl_matrix_1.mat4.perspective(this.shadowMapProjection, TAU / 4, 1.0, 1.0, 256);
                    this.shadowMapView = gl_matrix_1.mat4.create();
                }
                PointLight.prototype.renderShadowMapPrologue = function (renderState, scene) {
                    if (!this.shadowMapProgram.load(renderState.gl))
                        return false;
                    var gl = renderState.gl;
                    renderState.useProgram(this.shadowMapProgram);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowMapFramebuffer);
                    gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
                    gl.colorMask(false, false, false, false);
                    gl.clear(gl.DEPTH_BUFFER_BIT);
                    gl.cullFace(gl.FRONT);
                    var prog = this.shadowMapProgram;
                    gl.uniformMatrix4fv(prog.u_projection, false, this.shadowMapProjection);
                    var pos = this.position;
                    gl_matrix_1.mat4.identity(this.shadowMapView);
                    gl_matrix_1.mat4.rotateX(this.shadowMapView, this.shadowMapView, TAU / 4);
                    gl_matrix_1.mat4.translate(this.shadowMapView, this.shadowMapView, [-pos[0], -pos[1], -pos[2]]);
                    gl.uniformMatrix4fv(prog.u_viewMatrix, false, this.shadowMapView);
                    return true;
                };
                PointLight.prototype.renderShadowMapEpilogue = function (renderState, scene) {
                    var gl = renderState.gl;
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                    gl.colorMask(true, true, true, true);
                };
                return PointLight;
            }());
            exports_1("PointLight", PointLight);
            Group = /** @class */ (function () {
                function Group() {
                    this.children = [];
                    this.castsShadow = true;
                    this.parentGroup = null;
                    this.localMatrix = gl_matrix_1.mat4.create();
                }
                Group.prototype.render = function (renderState, scene) {
                    this.forEach(function (mdl) {
                        mdl.render(renderState, scene);
                    });
                };
                Group.prototype.attachModel = function (model) {
                    this.children.push(model);
                    model.parentGroup = this;
                };
                Group.prototype.applyModelMatrix = function (mtx) {
                    if (this.parentGroup)
                        this.parentGroup.applyModelMatrix(mtx);
                    gl_matrix_1.mat4.multiply(mtx, mtx, this.localMatrix);
                };
                Group.prototype.forEach = function (cb) {
                    this.children.forEach(cb);
                };
                return Group;
            }());
            exports_1("Group", Group);
            BaseModel = /** @class */ (function () {
                function BaseModel(gl) {
                    var args = [];
                    for (var _i = 1; _i < arguments.length; _i++) {
                        args[_i - 1] = arguments[_i];
                    }
                    this.parentGroup = null;
                    this.loaded = false;
                    this.primitives = [];
                    this.gl = gl;
                    this.primitives = [];
                    this.localMatrix = gl_matrix_1.mat4.create();
                    this.castsShadow = true;
                    this._buildModel.apply(this, __spread(args));
                }
                BaseModel.prototype.applyModelMatrix = function (mtx) {
                    if (this.parentGroup)
                        this.parentGroup.applyModelMatrix(mtx);
                    gl_matrix_1.mat4.multiply(mtx, mtx, this.localMatrix);
                };
                BaseModel.prototype._setBuffers = function (verts, nrmls) {
                    var gl = this.gl;
                    if (verts) {
                        this.vertBuffer = gl.createBuffer();
                        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
                        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
                    }
                    if (nrmls) {
                        this.nrmlBuffer = gl.createBuffer();
                        gl.bindBuffer(gl.ARRAY_BUFFER, this.nrmlBuffer);
                        gl.bufferData(gl.ARRAY_BUFFER, nrmls, gl.STATIC_DRAW);
                    }
                    this.loaded = true;
                };
                BaseModel.prototype._renderPrologue = function (renderState, scene) {
                    var gl = this.gl;
                    // XXX(jstpierre): Type this better eventually... likely with UBOs and such.
                    var prog = renderState.currentProgram;
                    if ('u_localMatrix' in prog) {
                        var mdlMtx = gl_matrix_1.mat4.create();
                        this.applyModelMatrix(mdlMtx);
                        gl.uniformMatrix4fv(prog.u_localMatrix, false, mdlMtx);
                    }
                    if ('a_position' in prog) {
                        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
                        gl.vertexAttribPointer(prog.a_position, 3, gl.FLOAT, false, 0, 0);
                        gl.enableVertexAttribArray(prog.a_position);
                    }
                    if ('a_normal' in prog) {
                        gl.bindBuffer(gl.ARRAY_BUFFER, this.nrmlBuffer);
                        gl.vertexAttribPointer(prog.a_normal, 3, gl.FLOAT, false, 0, 0);
                        gl.enableVertexAttribArray(prog.a_normal);
                    }
                };
                BaseModel.prototype._renderEpilogue = function (renderState, scene) {
                    var gl = this.gl;
                    var prog = renderState.currentProgram;
                    if ('a_position' in prog)
                        gl.disableVertexAttribArray(prog.a_position);
                    if ('a_normal' in prog)
                        gl.disableVertexAttribArray(prog.a_normal);
                };
                BaseModel.prototype._renderPrimitive = function (renderState, prim) {
                    var gl = this.gl;
                    gl.drawArrays(prim.drawType, prim.start, prim.count);
                };
                BaseModel.prototype.setMaterial = function (material) {
                    this.material = material;
                };
                BaseModel.prototype.render = function (renderState, scene) {
                    var _this = this;
                    if (!this.loaded)
                        return;
                    if (!this.material.load(renderState.gl))
                        return;
                    renderState.useMaterial(this.material, scene);
                    this._renderPrologue(renderState, scene);
                    this.primitives.forEach(function (prim) {
                        _this._renderPrimitive(renderState, prim);
                    });
                    this._renderEpilogue(renderState, scene);
                };
                return BaseModel;
            }());
            PBRMaterial = /** @class */ (function (_super) {
                __extends(PBRMaterial, _super);
                function PBRMaterial() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                PBRMaterial.prototype.compileProgram = function (gl, prog) {
                    return this.compileProgramFromURL(gl, prog, 'fx_PBR.glsl');
                    ;
                };
                PBRMaterial.prototype.bind = function (gl, prog) {
                    _super.prototype.bind.call(this, gl, prog);
                    this.u_localMatrix = gl.getUniformLocation(prog, 'u_localMatrix');
                    this.a_position = gl.getAttribLocation(prog, 'a_position');
                    this.a_normal = gl.getAttribLocation(prog, 'a_normal');
                    this.u_material_diffuseColor = gl.getUniformLocation(prog, 'u_material.diffuseColor');
                    this.u_material_roughness = gl.getUniformLocation(prog, 'u_material.roughness');
                    // there are four lights.
                    var NUM_LIGHTS = 4;
                    this.u_lights = [];
                    for (var i = 0; i < NUM_LIGHTS; i++) {
                        var light = {};
                        light.position = gl.getUniformLocation(prog, "u_lights[" + i + "].pos");
                        light.color = gl.getUniformLocation(prog, "u_lights[" + i + "].color");
                        light.radius = gl.getUniformLocation(prog, "u_lights[" + i + "].radius");
                        light.intensity = gl.getUniformLocation(prog, "u_lights[" + i + "].intensity");
                        light.projection = gl.getUniformLocation(prog, "u_lights[" + i + "].projection");
                        light.view = gl.getUniformLocation(prog, "u_lights[" + i + "].view");
                        light.shadowMap = gl.getUniformLocation(prog, "u_lights_shadowMap[" + i + "]");
                        this.u_lights.push(light);
                    }
                };
                PBRMaterial.prototype.renderPrologue = function (renderState, scene) {
                    var gl = renderState.gl;
                    renderState.useProgram(this);
                    var setLight = function (glLight, mLight, i) {
                        gl.uniform3fv(glLight.position, mLight.position);
                        gl.uniform3fv(glLight.color, mLight.color);
                        gl.uniform1f(glLight.intensity, mLight.intensity);
                        gl.uniform1f(glLight.radius, mLight.radius);
                        gl.activeTexture(gl.TEXTURE0 + i);
                        gl.bindTexture(gl.TEXTURE_2D, mLight.shadowMapDepth);
                        gl.uniform1i(glLight.shadowMap, i);
                        gl.uniformMatrix4fv(glLight.projection, false, mLight.shadowMapProjection);
                        gl.uniformMatrix4fv(glLight.view, false, mLight.shadowMapView);
                    };
                    for (var i = 0; i < scene.lights.length; i++)
                        setLight(this.u_lights[i], scene.lights[i], i);
                    gl.uniform3fv(this.u_material_diffuseColor, this.diffuseColor);
                    gl.uniform1f(this.u_material_roughness, this.roughness);
                };
                PBRMaterial.prototype.set = function (diffuseColor, roughness) {
                    this.diffuseColor = diffuseColor;
                    this.roughness = roughness;
                };
                return PBRMaterial;
            }(ModelProgram));
            exports_1("PBRMaterial", PBRMaterial);
            JMDL = /** @class */ (function (_super) {
                __extends(JMDL, _super);
                function JMDL() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                JMDL.prototype._fetch = function (path) {
                    var request = new XMLHttpRequest();
                    request.open("GET", "src/" + path, true);
                    request.responseType = "arraybuffer";
                    request.send();
                    return request;
                };
                JMDL.prototype._buildModel = function (filename) {
                    var _this = this;
                    this.loaded = false;
                    var req = this._fetch(filename);
                    req.onload = function () {
                        _this._buildModelBuf(req.response);
                    };
                };
                JMDL.prototype._buildModelBuf = function (buffer) {
                    var gl = this.gl;
                    var view = new DataView(buffer);
                    var offs = 0;
                    var req = function (match) {
                        var buf = new Uint8Array(buffer, offs, match.length);
                        for (var i = 0; i < match.length; i++) {
                            var elem = buf[i];
                            if (buf[i] !== match.charCodeAt(i)) {
                                var m_ = void 0;
                            }
                        }
                        offs += match.length;
                    };
                    req('JMDL');
                    var nface = view.getInt32(offs, false);
                    offs += 4;
                    var nvert = 3 * nface;
                    var vertsize = 3;
                    req('JVTX');
                    var vtx = buffer.slice(offs, offs + nvert * vertsize * Float32Array.BYTES_PER_ELEMENT);
                    offs += vtx.byteLength;
                    req('JNRM');
                    var nrm = buffer.slice(offs, offs + nvert * vertsize * Float32Array.BYTES_PER_ELEMENT);
                    offs += nrm.byteLength;
                    var prim = { start: 0, count: nface * 3, drawType: gl.TRIANGLES };
                    this.primitives.push(prim);
                    this._setBuffers(vtx, nrm);
                };
                return JMDL;
            }(BaseModel));
            exports_1("JMDL", JMDL);
            Plane = /** @class */ (function (_super) {
                __extends(Plane, _super);
                function Plane() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                Plane.prototype._buildModel = function () {
                    var gl = this.gl;
                    var verts = new Float32Array(VERT_N_ITEMS * 4);
                    var nrmls = new Float32Array(VERT_N_ITEMS * 4);
                    verts[0] = -1;
                    verts[1] = 0;
                    verts[2] = -1;
                    verts[3] = 1;
                    verts[4] = 0;
                    verts[5] = -1;
                    verts[6] = -1;
                    verts[7] = 0;
                    verts[8] = 1;
                    verts[9] = 1;
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
                    var prim = { start: 0, count: 4, drawType: gl.TRIANGLE_STRIP };
                    this.primitives.push(prim);
                    this._setBuffers(verts.buffer, nrmls.buffer);
                };
                return Plane;
            }(BaseModel));
            exports_1("Plane", Plane);
            LightBillboardMaterial = /** @class */ (function (_super) {
                __extends(LightBillboardMaterial, _super);
                function LightBillboardMaterial() {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    var _this = _super.apply(this, __spread(args)) || this;
                    _this.color = gl_matrix_1.vec3.create();
                    return _this;
                }
                LightBillboardMaterial.prototype.compileProgram = function (gl, prog) {
                    return this.compileProgramFromURL(gl, prog, 'fx_LightBillboard.glsl');
                };
                LightBillboardMaterial.prototype.bind = function (gl, prog) {
                    _super.prototype.bind.call(this, gl, prog);
                    this.u_localMatrix = gl.getUniformLocation(prog, 'u_localMatrix');
                    this.a_position = gl.getAttribLocation(prog, 'a_position');
                    this.u_size = gl.getUniformLocation(prog, 'u_size');
                    this.u_color = gl.getUniformLocation(prog, 'u_color');
                };
                LightBillboardMaterial.prototype.renderPrologue = function (renderState, scene) {
                    var gl = renderState.gl;
                    renderState.useProgram(this);
                    gl.uniform2fv(this.u_size, [1, 1]);
                    gl.uniform3fv(this.u_color, this.color);
                };
                LightBillboardMaterial.prototype.setColor = function (color) {
                    gl_matrix_1.vec3.copy(this.color, color);
                };
                return LightBillboardMaterial;
            }(ModelProgram));
            LightBillboard = /** @class */ (function (_super) {
                __extends(LightBillboard, _super);
                function LightBillboard() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                LightBillboard.prototype._buildModel = function () {
                    var gl = this.gl;
                    var verts = new Float32Array(VERT_N_ITEMS * 4);
                    verts[0] = -1;
                    verts[1] = -1;
                    verts[2] = 0;
                    verts[3] = 1;
                    verts[4] = -1;
                    verts[5] = 0;
                    verts[6] = -1;
                    verts[7] = 1;
                    verts[8] = 0;
                    verts[9] = 1;
                    verts[10] = 1;
                    verts[11] = 0;
                    var prim = { start: 0, count: 4, drawType: gl.TRIANGLE_STRIP };
                    this.primitives.push(prim);
                    this._setBuffers(verts.buffer, null);
                    this.setMaterial(new LightBillboardMaterial());
                    this.castsShadow = false;
                };
                LightBillboard.prototype.setPosition = function (pos) {
                    gl_matrix_1.mat4.fromTranslation(this.localMatrix, pos);
                };
                LightBillboard.prototype.setColor = function (color) {
                    this.material.setColor(color);
                };
                return LightBillboard;
            }(BaseModel));
            exports_1("LightBillboard", LightBillboard);
        }
    };
});
System.register("pbrtview", ["gl-matrix", "models"], function (exports_2, context_2) {
    "use strict";
    var __moduleName = context_2 && context_2.id;
    function clamp(x, min, max) {
        return Math.max(min, Math.min(x, max));
    }
    function absclamp(x, lim) {
        return clamp(x, -lim, lim);
    }
    function sign(n) {
        return n === 0 ? 0 : n > 0 ? 1 : -1;
    }
    function cameraController(canvas) {
        var keysDown = {};
        var SHIFT = 16;
        function isKeyDown(key) {
            return !!keysDown[key.charCodeAt(0)];
        }
        window.addEventListener('keydown', function (e) {
            keysDown[e.keyCode] = true;
        });
        window.addEventListener('keyup', function (e) {
            delete keysDown[e.keyCode];
        });
        var Z = -150;
        var vZ = 0;
        function updateCamera() {
            var x = P, y = T;
            var sinX = Math.sin(x);
            var cosX = Math.cos(x);
            var sinY = Math.sin(y);
            var cosY = Math.cos(y);
            return gl_matrix_2.mat4.fromValues(cosY, sinX * sinY, -cosX * sinY, 0, 0, cosX, sinX, 0, sinY, -sinX * cosY, cosX * cosY, 0, 0, 0, Z, 1);
        }
        var vT = 0, vP = 0;
        var dragging = false, px, py;
        canvas.addEventListener('mousedown', function (e) {
            dragging = true;
            canvas.classList.add('grabbing');
            px = e.pageX;
            py = e.pageY;
        });
        canvas.addEventListener('mouseup', function (e) {
            dragging = false;
            canvas.classList.remove('grabbing');
        });
        canvas.addEventListener('mousemove', function (e) {
            if (!dragging)
                return;
            var dx = e.pageX - px;
            var dy = e.pageY - py;
            px = e.pageX;
            py = e.pageY;
            vT += dx / 200;
            vP += dy / 200;
        });
        canvas.addEventListener('wheel', function (e) {
            vZ += sign(e.deltaY) * -4;
            e.preventDefault();
        });
        var T = 0.35, P = 0.15;
        return function update() {
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
            P += vP / 10;
            vP *= drag;
            if (P < 0.04)
                P = 0.04, vP = 0;
            if (P > 1.50)
                P = 1.50, vP = 0;
            T += vT / 10;
            vT *= drag;
            Z += vZ;
            vZ *= 0.8;
            if (Z > -10)
                Z = -10, vZ = 0;
            return updateCamera();
        };
    }
    function createViewer(canvas) {
        var renderer = new Models.Renderer(new Models.Viewport(canvas));
        var gl = renderer.renderState.gl;
        renderer.postPasses.push(new Models.PostPass(new Models.PostPassProgram_ChromaAberration()));
        renderer.postPasses.push(new Models.PostPass(new Models.PostPassProgram_Vignette()));
        var scene = new Models.Scene();
        scene.camera = new Models.Camera();
        var lights = [
            new Models.PointLight(gl, [0, 50, 0], [1, .6, .6], 4, 100),
            new Models.PointLight(gl, [0, 45, 0], [.6, 1, .6], 4, 125),
            new Models.PointLight(gl, [0, 55, 0], [.6, .6, 1], 4, 150),
        ];
        scene.lights = lights;
        var eh_t = new Models.JMDL(gl, 'eh_t.jmdl');
        eh_t.setMaterial(new Models.PBRMaterial([0.2, 0.2, 0.2], 0.1));
        var eh_b = new Models.JMDL(gl, 'eh_b.jmdl');
        eh_b.setMaterial(new Models.PBRMaterial([0.2, 0.05, 0.05], 0.5));
        var eh1 = new Models.Group();
        gl_matrix_2.mat4.scale(eh1.localMatrix, eh1.localMatrix, [2, 2, 2]);
        eh1.attachModel(eh_t);
        eh1.attachModel(eh_b);
        scene.models.push(eh1);
        var plane = new Models.Plane(gl);
        plane.setMaterial(new Models.PBRMaterial([0.2, 0.2, 0.2], 1.0));
        gl_matrix_2.mat4.scale(plane.localMatrix, plane.localMatrix, [200, 200, 200]);
        scene.models.push(plane);
        var lightBillboards = lights.map(function (light) {
            var bb = new Models.LightBillboard(gl);
            scene.models.push(bb);
            return bb;
        });
        var t = 0;
        var updateCameraController = cameraController(canvas);
        function update(nt) {
            t = nt;
            lights[0].position[0] = Math.cos(t / 890) * 30;
            lights[0].position[2] = Math.sin(t / 730) * 30;
            lights[1].position[0] = Math.cos(t / 930 + 1) * 30;
            lights[1].position[2] = Math.sin(t / 670 + 1) * 30;
            lights[2].position[0] = Math.cos(t / 430 + 1.2) * 30;
            lights[2].position[2] = Math.cos(t / 610 + 1.2) * 30;
            for (var i = 0; i < lights.length; i++) {
                var light = lights[i];
                var bb = lightBillboards[i];
                bb.setPosition(light.position);
                bb.setColor(light.color);
            }
            gl_matrix_2.mat4.copy(scene.camera.view, updateCameraController());
            renderer.render(scene);
            window.requestAnimationFrame(update);
        }
        update(0);
    }
    exports_2("createViewer", createViewer);
    var gl_matrix_2, Models;
    return {
        setters: [
            function (gl_matrix_2_1) {
                gl_matrix_2 = gl_matrix_2_1;
            },
            function (Models_1) {
                Models = Models_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("main", ["pbrtview"], function (exports_3, context_3) {
    "use strict";
    var __moduleName = context_3 && context_3.id;
    var pbrtview_1, Main;
    return {
        setters: [
            function (pbrtview_1_1) {
                pbrtview_1 = pbrtview_1_1;
            }
        ],
        execute: function () {
            Main = /** @class */ (function () {
                function Main() {
                    this.canvas = document.createElement('canvas');
                    document.body.appendChild(this.canvas);
                    window.onresize = this._onResize.bind(this);
                    this._onResize();
                    pbrtview_1.createViewer(this.canvas);
                }
                Main.prototype._onResize = function () {
                    this.canvas.width = window.innerWidth;
                    this.canvas.height = window.innerHeight;
                };
                return Main;
            }());
            window.main = new Main();
        }
    };
});
//# sourceMappingURL=main.js.map