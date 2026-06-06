import asyncio
import sys
import edge_tts

async def main():
    rate  = sys.argv[1] if len(sys.argv) > 1 else "+0%"
    pitch = sys.argv[2] if len(sys.argv) > 2 else "+0Hz"
    text  = sys.stdin.buffer.read().decode("utf-8").strip()
    if not text:
        return
    communicate = edge_tts.Communicate(text, "ko-KR-HyunsuNeural", rate=rate, pitch=pitch)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
    sys.stdout.buffer.write(audio_data)

asyncio.run(main())
