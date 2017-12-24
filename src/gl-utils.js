(function(exports) {
    "use strict";

    const GLUtils = {};

    function compileShader(gl, str, type) {
        const shader = gl.createShader(type);

        gl.shaderSource(shader, str);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(str);
            console.error(gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    }

    function compileShaders(gl, prog, fullVert, fullFrag) {
        const vertShader = compileShader(gl, fullVert, gl.VERTEX_SHADER);
        const fragShader = compileShader(gl, fullFrag, gl.FRAGMENT_SHADER);
        gl.attachShader(prog, vertShader);
        gl.attachShader(prog, fragShader);
        gl.linkProgram(prog);
    }

    function fetch(path) {
        const request = new XMLHttpRequest();
        request.open("GET", path, false);
        request.overrideMimeType('text/plain');
        request.send();
        return request.responseText;
    }

    function compileProgramFile(gl, filename) {
        const prog = gl.createProgram();

        const vertHeader = '#version 300 es\n#define VERT 1\n#define vert_main main\n#define varying out';
        const fragHeader = '#version 300 es\n#define FRAG 1\n#define frag_main main\n#define varying in';
        const v = fetch(filename);
        const fullVert = vertHeader + v;
        const fullFrag = fragHeader + v;
        compileShaders(gl, prog, fullVert, fullFrag);

        return prog;
    }
    GLUtils.compileProgramFile = compileProgramFile;

    exports.GLUtils = GLUtils;

})(window);
