c = open("frontend/src/components/DriverPortal.jsx", "r", encoding="utf-8").read()
c = c.replace("            ?\n          </button>", "            ⭐\n          </button>")
# Also fix any other broken star emojis
c = c.replace("            ?\r\n          </button>", "            ⭐\n          </button>")
open("frontend/src/components/DriverPortal.jsx", "w", encoding="utf-8").write(c)
print("Done")
