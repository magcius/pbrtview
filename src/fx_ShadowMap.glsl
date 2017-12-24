
precision mediump float;

uniform mat4 u_localMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projection;

#ifdef VERT
attribute vec3 a_position;

void main() {
    vec4 positionWorld = u_localMatrix * vec4(a_position, 1);
    vec4 positionEye = u_viewMatrix * positionWorld;
    gl_Position = u_projection * positionEye;
}
#endif

#ifdef FRAG
void main() {
    gl_FragColor = vec4(gl_FragCoord.z, 0, 0, 1);
}
#endif
