plugins {
    base
}

val npmInstall by tasks.registering(Exec::class) {
    group = "build setup"
    description = "Installs frontend dependencies with npm ci."
    workingDir = projectDir
    commandLine("npm", "ci")

    inputs.files("package.json", "package-lock.json")
    outputs.dir("node_modules")
}

val npmBuild by tasks.registering(Exec::class) {
    group = "build"
    description = "Builds the Angular frontend."
    dependsOn(npmInstall)
    workingDir = projectDir
    commandLine("npm", "run", "build")

    inputs.files("package.json", "package-lock.json", "angular.json", "tsconfig.json", "tsconfig.app.json")
    inputs.dir("src")
    inputs.dir("public")
    outputs.dir("dist")
}

val npmTest by tasks.registering(Exec::class) {
    group = "verification"
    description = "Runs the Angular unit tests once."
    dependsOn(npmInstall)
    workingDir = projectDir
    commandLine("npm", "run", "test")

    inputs.files("package.json", "package-lock.json", "angular.json", "tsconfig.json", "tsconfig.spec.json")
    inputs.dir("src")
}

tasks.register("test") {
    group = "verification"
    description = "Runs the Angular unit tests."
    dependsOn(npmTest)
}

tasks.named("build") {
    dependsOn(npmBuild)
}

tasks.named("check") {
    dependsOn(npmTest)
}

