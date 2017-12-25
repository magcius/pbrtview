
precision mediump float;
precision highp sampler2DShadow;

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
uniform sampler2DShadow u_lights_shadowMap[NUM_LIGHTS];

varying vec4 v_positionWorld;
varying vec4 v_positionEye;
varying vec3 v_normalEye;
varying vec2 v_uv;

varying vec4 v_lights_positionEye[NUM_LIGHTS];

#ifdef VERT
in vec3 a_position;
in vec3 a_normal;

void main() {
    v_positionWorld = u_localMatrix * vec4(a_position, 1);
    v_positionEye = u_viewMatrix * v_positionWorld;
    v_normalEye = mat3(u_viewMatrix * u_localMatrix) * a_normal;
    gl_Position = u_projection * v_positionEye;
    v_uv = (a_position.xz + 1.0) / 2.0;

    const mat4 depthScaleMatrix = mat4(0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 0.5, 1.0);
    for (int i = 0; i < NUM_LIGHTS; i++) {
        Light light = u_lights[i];
        v_lights_positionEye[i] = depthScaleMatrix * light.projection * light.view * v_positionWorld;
    }
}
#endif

#ifdef FRAG
out vec4 o_color;

float attenuate(const in Light light, const in float dist) {
    float att = clamp(1.0 - dist/light.radius, 0.0, 1.0);
    return att * att;
}

vec3 brdf_F_Schlick(const in vec3 L, const in vec3 H, const in vec3 specularColor) {
    float LoH = clamp(dot(L, H), 0.0, 1.0);
    float fresnel = pow(1.0 - LoH, 5.0);
    return specularColor + (1.0 - specularColor) * fresnel;
}

float brdf_G_GGX_Smith(const in vec3 N, const in vec3 L, const in vec3 V, const in float roughness) {
    // GGX / Smith from s2013_pbs_epic_notes_v2.pdf
    float k = pow((roughness + 1.0), 2.0) / 8.0;
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
    vec3 F = brdf_F_Schlick(L, H, vec3(0.05, 0.05, 0.05));
    float G = brdf_G_GGX_Smith(N, L, V, roughness);
    float D = brdf_D_GGX(N, H, roughness);
    return F * G * D;
}

float light_getShadow(const in int lightIndex) {
    const float shadowBias = 0.008;
    Light light = u_lights[lightIndex];
    vec4 lightEyePos = v_lights_positionEye[lightIndex];
    lightEyePos.z -= shadowBias;
    return textureProj(u_lights_shadowMap[lightIndex], lightEyePos);
}

vec3 light_getReflectedLight(const in int lightIndex) {
    Light light = u_lights[lightIndex];

    if (light.radius <= 1.0)
        return vec3(0);

    vec3 lightPosEye = (u_viewMatrix * vec4(light.pos, 1)).xyz;
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
    // for both specular and diffuse, but it's minimal so we don't care...
    vec3 outgoingLight = (directIrradiance * diffuse) + (directIrradiance * specular);
    return outgoingLight * light_getShadow(lightIndex);
}

void main() {
    vec3 directReflectedLight = vec3(0);

    for (int i = 0; i < NUM_LIGHTS; i++) {
        directReflectedLight += light_getReflectedLight(i);
    }

    vec3 indirectDiffuseIrradiance = vec3(0.5);
    vec3 indirectReflectedLight = indirectDiffuseIrradiance * u_material.diffuseColor;
    vec3 color = directReflectedLight + indirectReflectedLight;

    o_color = vec4(color, 1);
}
#endif
