c = open("frontend/src/components/RideCommunication.jsx", "r", encoding="utf-8").read()

# Add imports
if "useAgoraCall" not in c:
    c = c.replace(
        'import React, { useState, useEffect, useRef, useCallback } from "react";',
        'import React, { useState, useEffect, useRef, useCallback } from "react";\nimport { startCall, endCall, isCalling } from "@/hooks/useAgoraCall";'
    )

# Add calling state after existing state declarations
if "isInCall" not in c:
    c = c.replace(
        '  const scrollToBottom = useCallback(() => {',
        '  const [isInCall, setIsInCall] = useState(false);\n  const [callStatus, setCallStatus] = useState("");\n\n  const handleCall = async () => {\n    if (isInCall) {\n      await endCall();\n      setIsInCall(false);\n      setCallStatus("");\n    } else {\n      setCallStatus("Connecting...");\n      const result = await startCall(\n        rideId,\n        () => setCallStatus("Connected"),\n        () => { setIsInCall(false); setCallStatus(""); }\n      );\n      if (result.success) {\n        setIsInCall(true);\n        setCallStatus("Connected");\n      } else {\n        setCallStatus("");\n        alert("Call failed: " + result.error);\n      }\n    }\n  };\n\n  const scrollToBottom = useCallback(() => {'
    )

# Replace tel: links with Agora call handler - button 1
c = c.replace(
    'href={`tel:${otherPartyPhone}`}',
    'onClick={handleCall}'
).replace(
    '<a\n          href={`tel:${otherPartyPhone}`}',
    '<button\n          onClick={handleCall}'
).replace(
    'href={`tel:${otherPartyPhone}`}\n          ',
    'onClick={handleCall}\n          '
)

# Fix closing tags
c = c.replace(
    '>Call\n          </a>',
    '>{isInCall ? "End Call" : (callStatus || "Call")}\n          </button>'
)
c = c.replace(
    'title="Call"\n                />',
    'title="Call"\n                onClick={handleCall} />'
)

open("frontend/src/components/RideCommunication.jsx", "w", encoding="utf-8").write(c)
print("Done")
