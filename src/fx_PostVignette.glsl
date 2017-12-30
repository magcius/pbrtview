
precision highp float;

uniform sampler2D u_tex;

varying vec2 v_uv;

#ifdef VERT
void main() {
    v_uv.x = (gl_VertexID == 1) ? 2.0 : 0.0;
    v_uv.y = (gl_VertexID == 2) ? 2.0 : 0.0;
    gl_Position.xy = v_uv * vec2(2) - vec2(1);
    gl_Position.zw = vec2(1);
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
