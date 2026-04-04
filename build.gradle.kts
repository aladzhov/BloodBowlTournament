plugins {
    base
}

group = "com.bloodbowltournament"
version = "0.0.1-SNAPSHOT"

subprojects {
    group = rootProject.group
    version = rootProject.version
}

tasks.register("buildAll") {
    group = "build"
    description = "Builds both backend and frontend modules."
    dependsOn(":backend:build", ":frontend:build")
}

tasks.register("checkAll") {
    group = "verification"
    description = "Runs backend and frontend verification tasks."
    dependsOn(":backend:test", ":frontend:test")
}

