
precision highp float;

uniform sampler2D u_tex;

varying vec2 v_uv;

#ifdef VERT
in vec2 a_position;
in vec2 a_uv;

void main() {
    gl_Position = vec4(a_position, 1,1);
    v_uv = a_uv;
}
#endif

#ifdef FRAG
out vec4 o_color;

void main() {
    vec4 color = texture(u_tex, v_uv);
    vec2 pos = v_uv - vec2(0.5);
    float dist = smoothstep(0.75, 0.30, length(pos));
    color *= dist;
    o_color = color;
}
#endif
