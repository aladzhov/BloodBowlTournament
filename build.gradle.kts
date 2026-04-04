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
    description = "Builds the frontend module."
    dependsOn(":frontend:build")
}

tasks.register("checkAll") {
    group = "verification"
    description = "Runs frontend verification tasks."
    dependsOn(":frontend:test")
}

