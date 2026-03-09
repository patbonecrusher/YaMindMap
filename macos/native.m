#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>
#include "native.h"

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#define MAX_PENDING 32

static NSMutableArray<NSString *> *sPendingFiles = nil;
static NSMutableArray<NSString *> *sPendingMenuEvents = nil;
static NSLock *sLock = nil;
static BOOL sAppReady = NO;  // set to YES after yamindmap_native_init
static IMP sOriginalOpenURLsIMP = NULL;
static IMP sOriginalOpenFileIMP = NULL;

static void ensure_queues(void) {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        sLock = [[NSLock alloc] init];
        sPendingFiles = [[NSMutableArray alloc] init];
        sPendingMenuEvents = [[NSMutableArray alloc] init];
    });
}

static void push_file(NSString *path) {
    ensure_queues();
    [sLock lock];
    if (sPendingFiles.count < MAX_PENDING) {
        [sPendingFiles addObject:path];
    }
    [sLock unlock];
}

static void push_menu_event(NSString *eventId) {
    ensure_queues();
    [sLock lock];
    if (sPendingMenuEvents.count < MAX_PENDING) {
        [sPendingMenuEvents addObject:eventId];
    }
    [sLock unlock];
}

/// Open a file in a new instance of the app.
static void open_in_new_instance(NSString *path) {
    NSString *exe = [[NSBundle mainBundle] executablePath];
    if (!exe) {
        exe = [NSString stringWithUTF8String:
               [[[NSProcessInfo processInfo] arguments] firstObject].UTF8String];
    }
    [NSTask launchedTaskWithExecutableURL:[NSURL fileURLWithPath:exe]
                               arguments:@[path]
                                   error:nil
                      terminationHandler:nil];
}

/// Handle a file open request. During startup, queue it for the current
/// instance. After startup, spawn a new instance.
static void handle_file_open(NSString *path) {
    if (!sAppReady) {
        // App is still initializing — queue for current instance
        push_file(path);
    } else {
        // App is running — open in a new window (new process)
        open_in_new_instance(path);
    }
}

// ---------------------------------------------------------------------------
// C API for Rust
// ---------------------------------------------------------------------------

char* yamindmap_native_pop_file(void) {
    ensure_queues();
    [sLock lock];
    if (sPendingFiles.count == 0) {
        [sLock unlock];
        return NULL;
    }
    NSString *path = sPendingFiles[0];
    [sPendingFiles removeObjectAtIndex:0];
    [sLock unlock];
    return strdup(path.UTF8String);
}

const char* yamindmap_native_pop_menu_event(void) {
    ensure_queues();
    [sLock lock];
    if (sPendingMenuEvents.count == 0) {
        [sLock unlock];
        return NULL;
    }
    static char buf[64];
    NSString *eventId = sPendingMenuEvents[0];
    [sPendingMenuEvents removeObjectAtIndex:0];
    [sLock unlock];
    strlcpy(buf, eventId.UTF8String, sizeof(buf));
    return buf;
}

// ---------------------------------------------------------------------------
// Apple Event handler (registered early, before iced)
// ---------------------------------------------------------------------------

@interface YaMindMapAppleEventHandler : NSObject
- (void)handleOpenDocuments:(NSAppleEventDescriptor *)event
             withReplyEvent:(NSAppleEventDescriptor *)reply;
@end

@implementation YaMindMapAppleEventHandler

- (void)handleOpenDocuments:(NSAppleEventDescriptor *)event
             withReplyEvent:(NSAppleEventDescriptor *)reply {
    NSAppleEventDescriptor *directObj = [event paramDescriptorForKeyword:keyDirectObject];
    if (!directObj) return;

    NSInteger count = [directObj numberOfItems];
    for (NSInteger i = 1; i <= count; i++) {
        NSAppleEventDescriptor *item = [directObj descriptorAtIndex:i];
        // coerce to file URL
        NSAppleEventDescriptor *urlDesc = [item coerceToDescriptorType:typeFileURL];
        if (urlDesc) {
            NSString *urlString = [[NSString alloc] initWithData:[urlDesc data]
                                                        encoding:NSUTF8StringEncoding];
            NSURL *url = [NSURL URLWithString:urlString];
            if (url && url.isFileURL && url.path) {
                handle_file_open(url.path);
            }
        }
    }
}

@end

static YaMindMapAppleEventHandler *sAppleEventHandler = nil;

void yamindmap_native_early_init(void) {
    ensure_queues();

    // Register Apple Event handler for kAEOpenDocuments
    // This fires before iced/winit sets up its delegate, catching
    // file-open events from double-clicking .yamind files in Finder.
    sAppleEventHandler = [[YaMindMapAppleEventHandler alloc] init];
    [[NSAppleEventManager sharedAppleEventManager]
        setEventHandler:sAppleEventHandler
            andSelector:@selector(handleOpenDocuments:withReplyEvent:)
          forEventClass:kCoreEventClass
             andEventID:kAEOpenDocuments];
}

// ---------------------------------------------------------------------------
// Delegate method injection (for when app is already running)
// ---------------------------------------------------------------------------

static void swizzled_openURLs(id _self, SEL _cmd, NSApplication *app, NSArray<NSURL *> *urls) {
    NSMutableArray<NSURL *> *otherURLs = nil;
    for (NSURL *url in urls) {
        if (url.isFileURL && url.path &&
            [[url.path pathExtension] isEqualToString:@"yamind"]) {
            handle_file_open(url.path);
        } else {
            if (!otherURLs) otherURLs = [NSMutableArray array];
            [otherURLs addObject:url];
        }
    }
    if (sOriginalOpenURLsIMP && otherURLs.count > 0) {
        ((void (*)(id, SEL, NSApplication *, NSArray<NSURL *> *))sOriginalOpenURLsIMP)(
            _self, _cmd, app, otherURLs);
    }
}

static BOOL swizzled_openFile(id _self, SEL _cmd, NSApplication *app, NSString *filename) {
    if ([[filename pathExtension] isEqualToString:@"yamind"]) {
        handle_file_open(filename);
        return YES;
    }
    if (sOriginalOpenFileIMP) {
        return ((BOOL (*)(id, SEL, NSApplication *, NSString *))sOriginalOpenFileIMP)(
            _self, _cmd, app, filename);
    }
    return NO;
}

static void install_delegate_methods(void) {
    id delegate = [NSApp delegate];
    if (!delegate) return;
    Class cls = [delegate class];

    SEL openURLsSel = @selector(application:openURLs:);
    Method existing = class_getInstanceMethod(cls, openURLsSel);
    if (existing) {
        sOriginalOpenURLsIMP = method_setImplementation(existing, (IMP)swizzled_openURLs);
    } else {
        class_addMethod(cls, openURLsSel, (IMP)swizzled_openURLs, "v@:@@");
    }

    SEL openFileSel = @selector(application:openFile:);
    existing = class_getInstanceMethod(cls, openFileSel);
    if (existing) {
        sOriginalOpenFileIMP = method_setImplementation(existing, (IMP)swizzled_openFile);
    } else {
        class_addMethod(cls, openFileSel, (IMP)swizzled_openFile, "B@:@@");
    }
}

// ---------------------------------------------------------------------------
// App icon (for About panel when not running from .app bundle)
// ---------------------------------------------------------------------------

static NSImage *sAppIcon = nil;

void yamindmap_native_set_icon(const unsigned char* png_data, unsigned long png_len) {
    NSData *data = [NSData dataWithBytes:png_data length:png_len];
    sAppIcon = [[NSImage alloc] initWithData:data];
    if (sAppIcon) {
        [NSApp setApplicationIconImage:sAppIcon];
    }
}

// ---------------------------------------------------------------------------
// Menu action handler
// ---------------------------------------------------------------------------

@interface YaMindMapMenuHandler : NSObject
@property (nonatomic, copy) NSString *appVersion;
- (void)menuNew:(id)sender;
- (void)menuOpen:(id)sender;
- (void)menuSave:(id)sender;
- (void)menuSaveAs:(id)sender;
- (void)showAbout:(id)sender;
@end

@implementation YaMindMapMenuHandler

- (void)menuNew:(id)sender {
    push_menu_event(@"new");
}

- (void)menuOpen:(id)sender {
    push_menu_event(@"open");
}

- (void)menuSave:(id)sender {
    push_menu_event(@"save");
}

- (void)menuSaveAs:(id)sender {
    push_menu_event(@"save_as");
}

- (void)menuUndo:(id)sender {
    push_menu_event(@"undo");
}

- (void)menuRedo:(id)sender {
    push_menu_event(@"redo");
}

- (void)showAbout:(id)sender {
    NSString *version = self.appVersion ?: @"0.1.0";
    NSMutableDictionary *options = [@{
        @"ApplicationName": @"YaMindMap",
        @"Version": version,
        @"ApplicationVersion": version,
        @"Copyright": @"© 2026 YaMindMap",
        @"Credits": [[NSAttributedString alloc]
            initWithString:@"A blazing-fast, GPU-accelerated mind mapping application built with Rust and iced."
                attributes:@{
                    NSFontAttributeName: [NSFont systemFontOfSize:11],
                    NSForegroundColorAttributeName: [NSColor secondaryLabelColor]
                }],
    } mutableCopy];
    if (sAppIcon) {
        options[@"ApplicationIcon"] = sAppIcon;
    }
    [NSApp orderFrontStandardAboutPanelWithOptions:options];
}

@end

static YaMindMapMenuHandler *sMenuHandler = nil;

// ---------------------------------------------------------------------------
// Menu bar setup
// ---------------------------------------------------------------------------

static void setup_menu_bar(const char *version) {
    sMenuHandler = [[YaMindMapMenuHandler alloc] init];
    sMenuHandler.appVersion = [NSString stringWithUTF8String:version];

    NSMenu *mainMenu = [[NSMenu alloc] init];

    // ---- App menu ----
    NSMenuItem *appMenuItem = [[NSMenuItem alloc] init];
    NSMenu *appMenu = [[NSMenu alloc] initWithTitle:@"YaMindMap"];

    NSMenuItem *aboutItem = [[NSMenuItem alloc] initWithTitle:@"About YaMindMap"
                                                      action:@selector(showAbout:)
                                               keyEquivalent:@""];
    [aboutItem setTarget:sMenuHandler];
    [appMenu addItem:aboutItem];
    [appMenu addItem:[NSMenuItem separatorItem]];

    NSMenuItem *servicesItem = [[NSMenuItem alloc] initWithTitle:@"Services" action:nil keyEquivalent:@""];
    NSMenu *servicesMenu = [[NSMenu alloc] initWithTitle:@"Services"];
    [servicesItem setSubmenu:servicesMenu];
    [NSApp setServicesMenu:servicesMenu];
    [appMenu addItem:servicesItem];
    [appMenu addItem:[NSMenuItem separatorItem]];

    [appMenu addItemWithTitle:@"Hide YaMindMap" action:@selector(hide:) keyEquivalent:@"h"];
    NSMenuItem *hideOthers = [appMenu addItemWithTitle:@"Hide Others"
                                                action:@selector(hideOtherApplications:)
                                         keyEquivalent:@"h"];
    [hideOthers setKeyEquivalentModifierMask:NSEventModifierFlagCommand | NSEventModifierFlagOption];
    [appMenu addItemWithTitle:@"Show All" action:@selector(unhideAllApplications:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"Quit YaMindMap" action:@selector(terminate:) keyEquivalent:@"q"];

    [appMenuItem setSubmenu:appMenu];
    [mainMenu addItem:appMenuItem];

    // ---- File menu ----
    NSMenuItem *fileMenuItem = [[NSMenuItem alloc] init];
    NSMenu *fileMenu = [[NSMenu alloc] initWithTitle:@"File"];

    NSMenuItem *newItem = [[NSMenuItem alloc] initWithTitle:@"New" action:@selector(menuNew:) keyEquivalent:@"n"];
    [newItem setTarget:sMenuHandler];
    [fileMenu addItem:newItem];

    NSMenuItem *openItem = [[NSMenuItem alloc] initWithTitle:@"Open..." action:@selector(menuOpen:) keyEquivalent:@"o"];
    [openItem setTarget:sMenuHandler];
    [fileMenu addItem:openItem];
    [fileMenu addItem:[NSMenuItem separatorItem]];

    NSMenuItem *saveItem = [[NSMenuItem alloc] initWithTitle:@"Save" action:@selector(menuSave:) keyEquivalent:@"s"];
    [saveItem setTarget:sMenuHandler];
    [fileMenu addItem:saveItem];

    NSMenuItem *saveAsItem = [[NSMenuItem alloc] initWithTitle:@"Save As..." action:@selector(menuSaveAs:) keyEquivalent:@"S"];
    [saveAsItem setTarget:sMenuHandler];
    [fileMenu addItem:saveAsItem];
    [fileMenu addItem:[NSMenuItem separatorItem]];

    [fileMenu addItemWithTitle:@"Close Window" action:@selector(performClose:) keyEquivalent:@"w"];

    [fileMenuItem setSubmenu:fileMenu];
    [mainMenu addItem:fileMenuItem];

    // ---- Edit menu ----
    NSMenuItem *editMenuItem = [[NSMenuItem alloc] init];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];

    NSMenuItem *undoItem = [[NSMenuItem alloc] initWithTitle:@"Undo" action:@selector(menuUndo:) keyEquivalent:@"z"];
    [undoItem setTarget:sMenuHandler];
    [editMenu addItem:undoItem];
    NSMenuItem *redoItem = [[NSMenuItem alloc] initWithTitle:@"Redo" action:@selector(menuRedo:) keyEquivalent:@"Z"];
    [redoItem setTarget:sMenuHandler];
    [editMenu addItem:redoItem];
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];

    [editMenuItem setSubmenu:editMenu];
    [mainMenu addItem:editMenuItem];

    // ---- View menu ----
    NSMenuItem *viewMenuItem = [[NSMenuItem alloc] init];
    NSMenu *viewMenu = [[NSMenu alloc] initWithTitle:@"View"];
    NSMenuItem *fs = [viewMenu addItemWithTitle:@"Enter Full Screen"
                                         action:@selector(toggleFullScreen:)
                                  keyEquivalent:@"f"];
    [fs setKeyEquivalentModifierMask:NSEventModifierFlagCommand | NSEventModifierFlagControl];
    [viewMenuItem setSubmenu:viewMenu];
    [mainMenu addItem:viewMenuItem];

    // ---- Window menu ----
    NSMenuItem *windowMenuItem = [[NSMenuItem alloc] init];
    NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Window"];
    [windowMenu addItemWithTitle:@"Minimize" action:@selector(performMiniaturize:) keyEquivalent:@"m"];
    [windowMenu addItemWithTitle:@"Zoom" action:@selector(performZoom:) keyEquivalent:@""];
    [windowMenu addItem:[NSMenuItem separatorItem]];
    [windowMenu addItemWithTitle:@"Bring All to Front" action:@selector(arrangeInFront:) keyEquivalent:@""];
    [windowMenuItem setSubmenu:windowMenu];
    [NSApp setWindowsMenu:windowMenu];
    [mainMenu addItem:windowMenuItem];

    [NSApp setMainMenu:mainMenu];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

void yamindmap_native_install_open_handler(void) {
    ensure_queues();
    install_delegate_methods();
    // Re-register in case winit overwrote our Apple Event handler
    if (sAppleEventHandler) {
        [[NSAppleEventManager sharedAppleEventManager]
            setEventHandler:sAppleEventHandler
                andSelector:@selector(handleOpenDocuments:withReplyEvent:)
              forEventClass:kCoreEventClass
                 andEventID:kAEOpenDocuments];
    }
}

void yamindmap_native_init_menus(const char* version) {
    ensure_queues();
    setup_menu_bar(version);
    sAppReady = YES;
}

// ---------------------------------------------------------------------------
// Trackpad pinch (magnify) gesture
// ---------------------------------------------------------------------------

typedef struct {
    float delta;
    float x;
    float y;
} MagnifyEvent;

#define MAX_MAGNIFY 64
static MagnifyEvent sMagnifyQueue[MAX_MAGNIFY];
static int sMagnifyHead = 0;
static int sMagnifyTail = 0;
static NSLock *sMagnifyLock = nil;
static id sMagnifyMonitor = nil;

void yamindmap_native_install_magnify_handler(void) {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        sMagnifyLock = [[NSLock alloc] init];
        sMagnifyMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskMagnify
            handler:^NSEvent *(NSEvent *event) {
                // Get cursor position in screen coordinates, flip to top-left origin
                NSPoint screenPos = [NSEvent mouseLocation];
                NSWindow *window = [NSApp keyWindow];
                NSPoint winPos = screenPos;
                if (window) {
                    winPos = [window convertPointFromScreen:screenPos];
                    // Flip Y (AppKit is bottom-left, we want top-left)
                    winPos.y = window.contentView.frame.size.height - winPos.y;
                }

                [sMagnifyLock lock];
                int next = (sMagnifyTail + 1) % MAX_MAGNIFY;
                if (next != sMagnifyHead) {
                    sMagnifyQueue[sMagnifyTail].delta = (float)event.magnification;
                    sMagnifyQueue[sMagnifyTail].x = (float)winPos.x;
                    sMagnifyQueue[sMagnifyTail].y = (float)winPos.y;
                    sMagnifyTail = next;
                }
                [sMagnifyLock unlock];
                return event;
            }];
    });
}

int yamindmap_native_pop_magnify(float *out_delta, float *out_x, float *out_y) {
    if (!sMagnifyLock) return 0;
    [sMagnifyLock lock];
    if (sMagnifyHead == sMagnifyTail) {
        [sMagnifyLock unlock];
        return 0;
    }
    *out_delta = sMagnifyQueue[sMagnifyHead].delta;
    *out_x = sMagnifyQueue[sMagnifyHead].x;
    *out_y = sMagnifyQueue[sMagnifyHead].y;
    sMagnifyHead = (sMagnifyHead + 1) % MAX_MAGNIFY;
    [sMagnifyLock unlock];
    return 1;
}
