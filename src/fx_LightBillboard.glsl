
precision mediump float;

uniform mat4 u_localMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projection;

uniform vec2 u_size;
uniform vec3 u_color;

varying vec2 v_position;

#ifdef VERT
in vec3 a_position;

void main() {
    vec4 mdlPos = u_localMatrix * vec4(0, 0, 0, 1);
    vec3 cameraRight = (vec4(1, 0, 0, 0) * u_viewMatrix).xyz;
    vec3 cameraUp    = (vec4(0, 1, 0, 0) * u_viewMatrix).xyz;
    vec3 vtxPos = mdlPos.xyz + cameraRight*a_position.x*u_size.x + cameraUp*a_position.y*u_size.y;
    v_position = a_position.xy;
    gl_Position = u_projection * u_viewMatrix * vec4(vtxPos, 1);
}
#endif

#ifdef FRAG
out vec4 o_color;

void main() {
    float dist = length(v_position);
    if (dist > 1.0)
        discard;
    o_color = mix(vec4(u_color, 1), vec4(1, 1, 1, 1), 1.0 - dist);
}
#endif
