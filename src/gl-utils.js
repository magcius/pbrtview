(function(exports) {
    "use strict";

    var GLUtils = {};

    function compileShader(gl, str, type) {
        var shader = gl.createShader(type);

        gl.shaderSource(shader, str);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(str);
            console.error(gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    }

    GLUtils.compileShader = compileShader;

    function compileProgram(gl, common, vert, frag) {
        var fullVert = common + '\n\n\n' + vert;
        var fullFrag = common + '\n\n\n' + frag;

        var vertShader = GLUtils.compileShader(gl, fullVert, gl.VERTEX_SHADER);
        var fragShader = GLUtils.compileShader(gl, fullFrag, gl.FRAGMENT_SHADER);

        var prog = gl.createProgram();
        gl.attachShader(prog, vertShader);
        gl.attachShader(prog, fragShader);
        gl.linkProgram(prog);

        return prog;
    }

    GLUtils.compileProgram = compileProgram;

    exports.GLUtils = GLUtils;

})(window);
