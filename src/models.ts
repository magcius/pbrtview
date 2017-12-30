
import { mat4, vec3 } from 'gl-matrix';

const TAU = Math.PI * 2;

const VERT_N_ITEMS = 3;
const VERT_N_BYTES = VERT_N_ITEMS * Float32Array.BYTES_PER_ELEMENT;

abstract class Program {
    private glProg: WebGLProgram;
    private loaded: boolean = false;

    constructor(...args) {
        this.set(...args);
    }

    public set(...args):void {}

    protected compileShader(gl: WebGL2RenderingContext, str: string, type: number) {
        const shader: WebGLShader = gl.createShader(type);
    
        gl.shaderSource(shader, str);
        gl.compileShader(shader);
    
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(str);
            console.error(gl.getShaderInfoLog(shader));
            return null;
        }
    
        return shader;
    }

    protected compileShaders(gl: WebGL2RenderingContext, prog: WebGLProgram, fullVert: string, fullFrag: string) {
        const vertShader = this.compileShader(gl, fullVert, gl.VERTEX_SHADER);
        const fragShader = this.compileShader(gl, fullFrag, gl.FRAGMENT_SHADER);
        gl.attachShader(prog, vertShader);
        gl.attachShader(prog, fragShader);
        gl.linkProgram(prog);
    }

    protected compileProgramFromStr(gl: WebGL2RenderingContext, prog: WebGLProgram, str: string) {
        const vertHeader = '#version 300 es\n#define VERT 1\n#define vert_main main\n#define varying out';
        const fragHeader = '#version 300 es\n#define FRAG 1\n#define frag_main main\n#define varying in';
        const fullVert = vertHeader + str;
        const fullFrag = fragHeader + str;
        this.compileShaders(gl, prog, fullVert, fullFrag);
        this.bind(gl, prog);
    }

    private _fetch(path: string): XMLHttpRequest {
        const request = new XMLHttpRequest();
        request.open("GET", `src/${path}`, true);
        request.overrideMimeType('text/plain');
        request.send();
        return request;
    }

    protected compileProgramFromURL(gl: WebGL2RenderingContext, prog: WebGLProgram, filename: string) {
        const req = this._fetch(filename);
        req.onload = () => {
            this.compileProgramFromStr(gl, prog, req.responseText);
        };
    }

    protected abstract compileProgram(gl: WebGL2RenderingContext, prog: WebGLProgram);

    protected bind(gl: WebGL2RenderingContext, prog: WebGLProgram) {
        this.loaded = true;
    }

    public load(gl: WebGL2RenderingContext): boolean {
        if (this.loaded)
            return true;
        if (this.glProg)
            return false;

        this.glProg = gl.createProgram();
        this.compileProgram(gl, this.glProg);

        return false;
    }

    public getProgram(): WebGLProgram {
        return this.glProg;
    }
}

abstract class ModelProgram extends Program {
    public u_projection: WebGLUniformLocation;
    public u_viewMatrix: WebGLUniformLocation;

    protected bind(gl: WebGL2RenderingContext, prog: WebGLProgram) {
        super.bind(gl, prog);
        this.u_projection = gl.getUniformLocation(prog, "u_projection");
        this.u_viewMatrix = gl.getUniformLocation(prog, "u_viewMatrix");
    }
}

interface IMaterial {
    load(gl: WebGL2RenderingContext): boolean;
    renderPrologue(renderState: RenderState, scene: Scene);
}

export class Viewport {
    public canvas: HTMLCanvasElement;
    public gl: WebGL2RenderingContext;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.gl = canvas.getContext("webgl2", { alpha: false });
    }

    get width() {
        return this.canvas.width;
    }
    get height() {
        return this.canvas.height;
    }
}

export class RenderState {
    public gl: WebGL2RenderingContext;
    public viewport: Viewport;
    public currentProgram: Program = null;
    public time: number;

    public forceMaterial: boolean = false;

    constructor(viewport: Viewport) {
        this.viewport = viewport;
        this.gl = this.viewport.gl;
        this.time = 0;
    }

    public useProgram(prog: Program) {
        const gl = this.gl;
        this.currentProgram = prog;
        gl.useProgram(prog.getProgram());
    }

    public useMaterial(material: IMaterial, scene: Scene) {
        if (this.forceMaterial)
            return;

        material.renderPrologue(this, scene);
        scene.camera.renderPrologue(this, scene);
    }
}

interface ILight {
    renderShadowMapPrologue(renderState: RenderState, scene: Scene): boolean;
    renderShadowMapEpilogue(renderState: RenderState, scene: Scene): void;
}
interface IModel {
    parentGroup: Group;
    castsShadow: boolean;
    render(renderState: RenderState, scene: Scene);
}

export class Camera {
    public projection: mat4;
    public view: mat4;

    constructor() {
        this.projection = mat4.create();
        this.view = mat4.create();
    }

    public checkResize(renderState: RenderState, scene: Scene) {
        const viewport = renderState.viewport;
        const aspect = viewport.width / viewport.height;
        mat4.perspective(this.projection, Math.PI / 4, aspect, 0.2, 50000);
    }

    public renderPrologue(renderState: RenderState, scene: Scene) {
        const gl = renderState.gl;
        const prog = renderState.currentProgram as ModelProgram;
        gl.uniformMatrix4fv(prog.u_projection, false, this.projection);
        gl.uniformMatrix4fv(prog.u_viewMatrix, false, this.view);
    }
}

// A Scene is a declaration of every entity in the scene graph.
export class Scene {
    public camera: Camera;
    public lights: ILight[] = [];
    public models: IModel[] = [];
}

class PassFramebuffer {
    public scale: number = 1.0;
    public colorTex: WebGLTexture;

    private msaaFramebuffer: WebGLFramebuffer;
    private colorRenderbuffer: WebGLRenderbuffer;
    private depthRenderbuffer: WebGLRenderbuffer;
    private resolveFramebuffer: WebGLFramebuffer;
    private width: number;
    private height: number;
    private needsDepth: boolean = false;

    recreate(renderState: RenderState, needsDepth: boolean) {
        const gl = renderState.gl;

        const width = renderState.viewport.width * this.scale;
        const height = renderState.viewport.height * this.scale;

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

        const samples = 4;

        gl.getExtension('EXT_color_buffer_float');

        this.colorRenderbuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.colorRenderbuffer);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA16F, width, height);

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
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.resolveFramebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolveFramebuffer);
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTex, 0);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    setActive(renderState: RenderState) {
        const gl = renderState.gl;
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.msaaFramebuffer);
        gl.viewport(0, 0, this.width, this.height);
    }

    blit(renderState: RenderState) {
        const gl = renderState.gl;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFramebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolveFramebuffer);
        gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }
}

abstract class PostPassProgram extends Program {
    public u_tex: WebGLUniformLocation;

    public bind(gl: WebGL2RenderingContext, prog: WebGLProgram) {
        super.bind(gl, prog);
        this.u_tex = gl.getUniformLocation(prog, 'u_tex');
    }
}

export class PostPassProgram_Vignette extends PostPassProgram {
    public compileProgram(gl:WebGL2RenderingContext, prog:WebGLProgram) {
        this.compileProgramFromURL(gl, prog, 'fx_PostVignette.glsl');
    }
}

export class PostPassProgram_ChromaAberration extends PostPassProgram {
    public compileProgram(gl:WebGL2RenderingContext, prog:WebGLProgram) {
        this.compileProgramFromURL(gl, prog, 'fx_PostChromaAberration.glsl');
    }
}

export class PostPassProgram_Gamma extends PostPassProgram {
    public compileProgram(gl:WebGL2RenderingContext, prog:WebGLProgram) {
        this.compileProgramFromURL(gl, prog, 'fx_PostGamma.glsl');
    }
}

export class PostPass {
    public framebuffer: PassFramebuffer;
    private program: PostPassProgram;

    private vertBuffer: WebGLBuffer;
    private uvBuffer: WebGLBuffer;

    constructor(program: PostPassProgram) {
        this.program = program;
        this.framebuffer = new PassFramebuffer();
    }

    public load(renderState: RenderState): boolean {
        return this.program.load(renderState.gl);
    }

    public drawQuad(renderState: RenderState) {
        const gl = renderState.gl;
        renderState.useProgram(this.program);
        gl.disable(gl.DEPTH_TEST);
        gl.uniform1i(this.program.u_tex, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
}

export class Renderer {
    public renderState: RenderState;
    public postPasses: PostPass[] = [];

    constructor(viewport: Viewport) {
        this.renderState = new RenderState(viewport);
    }

    public render(scene: Scene): void {
        const gl = this.renderState.gl;
        const renderState = this.renderState;

        // Load our post passes.
        const postPasses = this.postPasses.filter((postPass) => postPass.load(renderState));

        for (let i = 0; i < postPasses.length; i++) {
            const postPass = postPasses[i];
            postPass.framebuffer.recreate(renderState, i === 0);
        }

        // Shadow maps.
        for (const light of scene.lights) {
            if (!light.renderShadowMapPrologue(renderState, scene))
                continue;

            renderState.forceMaterial = true;
            for (const model of scene.models) {
                if (model.castsShadow)
                    model.render(renderState, scene);
            }
            renderState.forceMaterial = false;

            light.renderShadowMapEpilogue(renderState, scene);
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

        for (const model of scene.models) {
            model.render(renderState, scene);
        }

        // Full-screen post passes.
        for (let i = 0; i < postPasses.length; i++) {
            const curPass = postPasses[i];
            const nextPass = postPasses[i + 1];

            curPass.framebuffer.blit(renderState);

            if (nextPass) {
                nextPass.framebuffer.setActive(renderState);
            } else {
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
                gl.viewport(0, 0, this.renderState.viewport.width, this.renderState.viewport.height);
            }

            gl.activeTexture(gl.TEXTURE0 + 0);
            gl.bindTexture(gl.TEXTURE_2D, curPass.framebuffer.colorTex);
            curPass.drawQuad(renderState);
        }
    }
}

class ShadowMapProgram extends ModelProgram {
    public u_localMatrix: WebGLUniformLocation;
    public a_position: number;

    protected compileProgram(gl: WebGL2RenderingContext, prog: WebGLProgram) {
        return this.compileProgramFromURL(gl, prog, 'fx_ShadowMap.glsl');
    }
    protected bind(gl: WebGL2RenderingContext, prog: WebGLProgram) {
        super.bind(gl, prog);
        this.u_localMatrix = gl.getUniformLocation(prog, 'u_localMatrix');
        this.a_position = gl.getAttribLocation(prog, 'a_position');
    }
}

const SHADOW_MAP_SIZE = 1024;
export class PointLight implements ILight {
    public position: vec3; 
    public color: vec3;
    public intensity: number;
    public radius: number;

    public shadowMapDepth: WebGLTexture;
    public shadowMapProjection: mat4;
    public shadowMapView: mat4;
    private shadowMapFramebuffer: WebGLFramebuffer;
    private shadowMapProgram: ShadowMapProgram;

    constructor(gl: WebGL2RenderingContext, position, color, intensity, radius) {
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
        this.shadowMapProjection = mat4.create();
        mat4.perspective(this.shadowMapProjection, TAU / 4, 1.0, 1.0, 256);
        this.shadowMapView = mat4.create();
    }

    renderShadowMapPrologue(renderState: RenderState, scene: Scene): boolean {
        if (!this.shadowMapProgram.load(renderState.gl))
            return false;

        const gl = renderState.gl;
        renderState.useProgram(this.shadowMapProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowMapFramebuffer);
        gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
        gl.colorMask(false, false, false, false);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.cullFace(gl.FRONT);

        const prog = this.shadowMapProgram;
        gl.uniformMatrix4fv(prog.u_projection, false, this.shadowMapProjection);

        const pos = this.position;
        mat4.identity(this.shadowMapView);
        mat4.rotateX(this.shadowMapView, this.shadowMapView, TAU / 4);
        mat4.translate(this.shadowMapView, this.shadowMapView, [-pos[0], -pos[1], -pos[2]]);
        gl.uniformMatrix4fv(prog.u_viewMatrix, false, this.shadowMapView);
        return true;
    }

    renderShadowMapEpilogue(renderState: RenderState, scene: Scene) {
        const gl = renderState.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.colorMask(true, true, true, true);
    }
}

export class Group implements IModel {
    children: IModel[] = [];
    localMatrix: mat4;
    castsShadow: boolean = true;
    parentGroup: Group = null;

    constructor() {
        this.localMatrix = mat4.create();
    }

    public render(renderState: RenderState, scene: Scene) {
        this.forEach((mdl) => {
            mdl.render(renderState, scene);
        });
    }

    public attachModel(model: IModel) {
        this.children.push(model);
        model.parentGroup = this;
    }

    public applyModelMatrix(mtx: mat4) {
        if (this.parentGroup)
            this.parentGroup.applyModelMatrix(mtx);

        mat4.multiply(mtx, mtx, this.localMatrix);
    }

    public forEach(cb: (mdl: IModel) => void) {
        this.children.forEach(cb);
    }
}

interface Primitive {
    start: number;
    count: number;
    drawType: number;
}

abstract class BaseModel implements IModel {
    public parentGroup: Group = null;
    public castsShadow: boolean;
    public loaded: boolean = false;
    public material: IMaterial;
    public localMatrix: mat4;

    protected gl: WebGL2RenderingContext;
    protected primitives: Primitive[] = [];

    private vertBuffer: WebGLBuffer;
    private nrmlBuffer: WebGLBuffer;

    constructor(gl, ...args) {
        this.gl = gl;

        this.primitives = [];
        this.localMatrix = mat4.create();

        this.castsShadow = true;

        this._buildModel(...args);
    }

    public applyModelMatrix(mtx: mat4) {
        if (this.parentGroup)
            this.parentGroup.applyModelMatrix(mtx);

        mat4.multiply(mtx, mtx, this.localMatrix);
    }

    protected abstract _buildModel(...args);

    protected _setBuffers(verts: ArrayBuffer, nrmls: ArrayBuffer) {
        const gl = this.gl;

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
    }

    protected _renderPrologue(renderState: RenderState, scene: Scene) {
        const gl = this.gl;

        // XXX(jstpierre): Type this better eventually... likely with UBOs and such.
        const prog = renderState.currentProgram as any;

        if ('u_localMatrix' in prog) {
            const mdlMtx = mat4.create();
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
    }
    protected _renderEpilogue(renderState: RenderState, scene: Scene) {
        const gl = this.gl;
        const prog = renderState.currentProgram as any;
        if ('a_position' in prog)
            gl.disableVertexAttribArray(prog.a_position);
        if ('a_normal' in prog)
            gl.disableVertexAttribArray(prog.a_normal);
    }
    private _renderPrimitive(renderState: RenderState, prim: Primitive) {
        const gl = this.gl;
        gl.drawArrays(prim.drawType, prim.start, prim.count);
    }

    setMaterial(material: IMaterial) {
        this.material = material;  
    }

    render(renderState: RenderState, scene: Scene) {
        if (!this.loaded)
            return;

        if (!this.material.load(renderState.gl))
            return;

        renderState.useMaterial(this.material, scene);
        this._renderPrologue(renderState, scene);
        this.primitives.forEach((prim: Primitive) => {
            this._renderPrimitive(renderState, prim);
        });
        this._renderEpilogue(renderState, scene);
    }
}

export class PBRMaterial extends ModelProgram implements IMaterial {
    public u_localMatrix: WebGLUniformLocation;
    public a_position: number;
    public a_normal: number;

    private u_material_diffuseColor: WebGLUniformLocation;
    private u_material_roughness: WebGLUniformLocation;
    private u_lights: any[];

    private diffuseColor: vec3;
    private roughness: number;

    protected compileProgram(gl: WebGL2RenderingContext, prog: WebGLProgram) {
        return this.compileProgramFromURL(gl, prog, 'fx_PBR.glsl');;
    }

    protected bind(gl: WebGL2RenderingContext, prog: WebGLProgram) {
        super.bind(gl, prog);
        this.u_localMatrix = gl.getUniformLocation(prog, 'u_localMatrix');

        this.a_position = gl.getAttribLocation(prog, 'a_position');
        this.a_normal = gl.getAttribLocation(prog, 'a_normal');

        this.u_material_diffuseColor = gl.getUniformLocation(prog, 'u_material.diffuseColor');
        this.u_material_roughness = gl.getUniformLocation(prog, 'u_material.roughness');

        // there are four lights.
        const NUM_LIGHTS = 4;
        this.u_lights = [];
        for (let i = 0; i < NUM_LIGHTS; i++) {
            const light:any = {};
            light.position = gl.getUniformLocation(prog, "u_lights["+i+"].pos");
            light.color = gl.getUniformLocation(prog, "u_lights["+i+"].color");
            light.radius = gl.getUniformLocation(prog, "u_lights["+i+"].radius");
            light.intensity = gl.getUniformLocation(prog, "u_lights["+i+"].intensity");
            light.projection = gl.getUniformLocation(prog, "u_lights["+i+"].projection");
            light.view = gl.getUniformLocation(prog, "u_lights["+i+"].view");
            light.shadowMap = gl.getUniformLocation(prog, "u_lights_shadowMap["+i+"]");
            this.u_lights.push(light);
        }
    }

    public renderPrologue(renderState: RenderState, scene: Scene) {
        const gl = renderState.gl;

        renderState.useProgram(this);

        const setLight = (glLight:any, mLight:PointLight, i:number) => {
            gl.uniform3fv(glLight.position, mLight.position);
            gl.uniform3fv(glLight.color, mLight.color);
            gl.uniform1f(glLight.intensity, mLight.intensity);
            gl.uniform1f(glLight.radius, mLight.radius);

            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, mLight.shadowMapDepth);
            gl.uniform1i(glLight.shadowMap, i);

            gl.uniformMatrix4fv(glLight.projection, false, mLight.shadowMapProjection);
            gl.uniformMatrix4fv(glLight.view, false, mLight.shadowMapView);
        }

        for (let i = 0; i < scene.lights.length; i++)
            setLight(this.u_lights[i], scene.lights[i] as PointLight, i);

        gl.uniform3fv(this.u_material_diffuseColor, this.diffuseColor);
        gl.uniform1f(this.u_material_roughness, this.roughness);
    }

    public set(diffuseColor: vec3, roughness: number) {
        this.diffuseColor = diffuseColor;
        this.roughness = roughness;
    }
}

export class JMDL extends BaseModel {
    private _fetch(path) {
        const request = new XMLHttpRequest();
        request.open("GET", `src/${path}`, true);
        request.responseType = "arraybuffer";
        request.send();
        return request;
    }

    protected _buildModel(filename: string) {
        this.loaded = false;
        const req = this._fetch(filename);
        req.onload = () => {
            this._buildModelBuf(req.response);
        };
    }
    private _buildModelBuf(buffer: ArrayBuffer) {
        const gl = this.gl;

        const view = new DataView(buffer);

        let offs = 0;
        const req = (match: string) => {
            const buf = new Uint8Array(buffer, offs, match.length);
            for (let i = 0; i < match.length; i++) {
                const elem = buf[i];
                if (buf[i] !== match.charCodeAt(i)) {
                    let m_:never;
                }
            }
            offs += match.length;
        };

        req('JMDL');
        const nface = view.getInt32(offs, false);
        offs += 4;

        const nvert = 3 * nface;
        const vertsize = 3;

        req('JVTX');
        const vtx = buffer.slice(offs, offs + nvert * vertsize * Float32Array.BYTES_PER_ELEMENT);
        offs += vtx.byteLength;

        req('JNRM');
        const nrm = buffer.slice(offs, offs + nvert * vertsize * Float32Array.BYTES_PER_ELEMENT);
        offs += nrm.byteLength;

        const prim = { start: 0, count: nface * 3, drawType: gl.TRIANGLES };
        this.primitives.push(prim);

        this._setBuffers(vtx, nrm);
    }
}

export class Plane extends BaseModel {
    _buildModel() {
        const gl = this.gl;

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

        const prim = { start: 0, count: 4, drawType: gl.TRIANGLE_STRIP };
        this.primitives.push(prim);

        this._setBuffers(verts.buffer, nrmls.buffer);
    }
}

class LightBillboardMaterial extends ModelProgram implements IMaterial {
    public u_localMatrix: WebGLUniformLocation;
    public a_position: number;

    private u_size: WebGLUniformLocation;
    private u_color: WebGLUniformLocation;

    private color: vec3;

    constructor(...args) {
        super(...args);

        this.color = vec3.create();
    }

    protected compileProgram(gl: WebGL2RenderingContext, prog: WebGLProgram) {
        return this.compileProgramFromURL(gl, prog, 'fx_LightBillboard.glsl');
    }

    protected bind(gl: WebGL2RenderingContext, prog: WebGLProgram) {
        super.bind(gl, prog);
        this.u_localMatrix = gl.getUniformLocation(prog, 'u_localMatrix');
        this.a_position = gl.getAttribLocation(prog, 'a_position');

        this.u_size = gl.getUniformLocation(prog, 'u_size');
        this.u_color = gl.getUniformLocation(prog, 'u_color');
    }

    public renderPrologue(renderState: RenderState, scene: Scene) {
        const gl = renderState.gl;

        renderState.useProgram(this);

        gl.uniform2fv(this.u_size, [1, 1]);
        gl.uniform3fv(this.u_color, this.color);
    }

    public setColor(color) {
        vec3.copy(this.color, color);
    }
}

export class LightBillboard extends BaseModel {
    _buildModel() {
        const gl = this.gl;

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

        const prim = { start: 0, count: 4, drawType: gl.TRIANGLE_STRIP };
        this.primitives.push(prim);

        this._setBuffers(verts.buffer, null);

        this.setMaterial(new LightBillboardMaterial());

        this.castsShadow = false;
    }
    public setPosition(pos: vec3) {
        mat4.fromTranslation(this.localMatrix, pos);
    }
    public setColor(color) {
        (this.material as LightBillboardMaterial).setColor(color);
    }
}
