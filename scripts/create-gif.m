#import <AppKit/AppKit.h>
#import <ImageIO/ImageIO.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

int main(int argc, const char *argv[]) {
  if (argc < 4) {
    return 1;
  }

  NSURL *output = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
  CGImageDestinationRef destination = CGImageDestinationCreateWithURL(
      (__bridge CFURLRef)output, (__bridge CFStringRef)UTTypeGIF.identifier, argc - 2, NULL);
  if (destination == NULL) {
    return 1;
  }

  NSDictionary *gifProperties = @{
    (__bridge NSString *)kCGImagePropertyGIFDictionary: @{
      (__bridge NSString *)kCGImagePropertyGIFLoopCount: @0,
    },
  };
  CGImageDestinationSetProperties(destination, (__bridge CFDictionaryRef)gifProperties);

  for (int index = 2; index < argc; index++) {
    NSImage *image = [[NSImage alloc] initWithContentsOfFile:[NSString stringWithUTF8String:argv[index]]];
    NSRect rect = NSMakeRect(0, 0, image.size.width, image.size.height);
    CGImageRef frame = [image CGImageForProposedRect:&rect context:nil hints:nil];
    if (frame == NULL) {
      CFRelease(destination);
      return 1;
    }
    NSDictionary *frameProperties = @{
        (__bridge NSString *)kCGImagePropertyGIFDictionary: @{
        (__bridge NSString *)kCGImagePropertyGIFDelayTime: @(index == argc - 1 ? 1.8 : 0.65),
      },
    };
    CGImageDestinationAddImage(destination, frame, (__bridge CFDictionaryRef)frameProperties);
  }

  BOOL success = CGImageDestinationFinalize(destination);
  CFRelease(destination);
  return success ? 0 : 1;
}
