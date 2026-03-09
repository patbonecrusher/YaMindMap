fn main() {
    // Embed icon into Windows executable
    #[cfg(target_os = "windows")]
    {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("assets/icons/yamindmap.ico");
        res.set("ProductName", "YaMindMap");
        res.set("FileDescription", "YaMindMap - Mind Map Application");
        res.set("LegalCopyright", "Copyright 2026");
        res.compile().expect("Failed to compile Windows resources");
    }

    // Compile native macOS Objective-C code
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=macos/native.m");
        println!("cargo:rerun-if-changed=macos/native.h");

        cc::Build::new()
            .file("macos/native.m")
            .flag("-fobjc-arc")
            .compile("yamindmap_native");

        println!("cargo:rustc-link-lib=framework=Cocoa");
    }
}
