import Cocoa

let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

func renderIcon(_ size: Int) -> Data {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let scale = CGFloat(size) / 1024
    NSGraphicsContext.current!.imageInterpolation = .high
    let transform = NSAffineTransform()
    transform.scale(by: scale)
    transform.concat()
    let tile = NSBezierPath(roundedRect: NSRect(x: 56, y: 56, width: 912, height: 912), xRadius: 207, yRadius: 207)
    NSColor(srgbRed: 0.24, green: 0.40, blue: 0.30, alpha: 1).setFill()
    tile.fill()
    NSColor(srgbRed: 0.91, green: 0.95, blue: 0.87, alpha: 1).setStroke()
    let plus = NSBezierPath()
    plus.lineWidth = 70
    plus.lineCapStyle = .round
    plus.move(to: NSPoint(x: 512, y: 300))
    plus.line(to: NSPoint(x: 512, y: 724))
    plus.move(to: NSPoint(x: 300, y: 512))
    plus.line(to: NSPoint(x: 724, y: 512))
    plus.stroke()
    NSGraphicsContext.restoreGraphicsState()
    return bitmap.representation(using: .png, properties: [:])!
}

for base in [16, 32, 128, 256, 512] {
    for multiplier in [1, 2] {
        let suffix = multiplier == 2 ? "@2x" : ""
        let name = "icon_\(base)x\(base)\(suffix).png"
        try renderIcon(base * multiplier).write(to: directory.appendingPathComponent(name))
    }
}
