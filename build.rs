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
}
