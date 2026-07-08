import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../utils/test-utils";
import { AssistantBar } from "@/components/features/ai/assistant-bar";
import type { AssistantMessage } from "@/lib/hooks/useAssistantChat";

// next/navigation isn't available in the test env; pathname drives both the
// bar's visibility and its workspace scoping, so make it swappable per test.
let mockPathname = "/tasks";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

// next/link needs the Next runtime — render a plain anchor.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

let mockRole: string | null = "super";
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockRole ? { id: "u1" } : null,
    profile: mockRole ? { id: "u1", role: mockRole, full_name: "Tyson" } : null,
    loading: false,
  }),
}));

// Mock the chat state machine — these tests cover the bar's UI wiring, not
// the network/persistence logic.
const sendMessage = vi.fn();
const stopGenerating = vi.fn();
const clearChat = vi.fn();
const loadRecentConversation = vi.fn();
const selectSpreadsheet = vi.fn();
let mockChat: {
  messages: AssistantMessage[];
  loading: boolean;
  uploading: boolean;
  toolActivity: string | null;
  pendingPhoto: null;
  pendingSpreadsheet: {
    file: File;
    data: {
      name: string;
      text: string;
      rowCount: number;
      sheetCount: number;
      truncated: boolean;
    };
  } | null;
  attachError: string | null;
  sendMessage: typeof sendMessage;
  stopGenerating: typeof stopGenerating;
  clearChat: typeof clearChat;
  selectPhoto: () => void;
  clearPendingPhoto: () => void;
  selectSpreadsheet: typeof selectSpreadsheet;
  clearPendingSpreadsheet: () => void;
  loadRecentConversation: typeof loadRecentConversation;
};

vi.mock("@/lib/hooks/useAssistantChat", () => ({
  useAssistantChat: () => mockChat,
}));

beforeEach(() => {
  mockPathname = "/tasks";
  mockRole = "super";
  sendMessage.mockClear();
  stopGenerating.mockClear();
  loadRecentConversation.mockClear();
  selectSpreadsheet.mockClear();
  mockChat = {
    messages: [],
    loading: false,
    uploading: false,
    toolActivity: null,
    pendingPhoto: null,
    pendingSpreadsheet: null,
    attachError: null,
    sendMessage,
    stopGenerating,
    clearChat,
    selectPhoto: vi.fn(),
    clearPendingPhoto: vi.fn(),
    selectSpreadsheet,
    clearPendingSpreadsheet: vi.fn(),
    loadRecentConversation,
  };
});

describe("AssistantBar", () => {
  it("renders the ask input for an allowed role", () => {
    render(<AssistantBar />);
    expect(screen.getByLabelText("Ask the AI assistant")).toBeInTheDocument();
  });

  it("renders nothing for roles without assistant access", () => {
    mockRole = "crew";
    const { container } = render(<AssistantBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when signed out", () => {
    mockRole = null;
    const { container } = render(<AssistantBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hides itself on the full-screen /assistant page", () => {
    mockPathname = "/assistant";
    const { container } = render(<AssistantBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the panel on click and shows workspace-scoped prompts", async () => {
    mockPathname = "/purchase-requests"; // → money workspace
    const { user } = render(<AssistantBar />);
    await user.click(screen.getByLabelText("Ask the AI assistant"));
    expect(screen.getByText("Money")).toBeInTheDocument();
    // One of the money workspace chips
    expect(
      screen.getByText("Enter last month's RecTrac rounds total"),
    ).toBeInTheDocument();
    expect(loadRecentConversation).toHaveBeenCalled();
  });

  it("opens the panel when typing, without needing a click", async () => {
    const { user } = render(<AssistantBar />);
    const input = screen.getByLabelText("Ask the AI assistant");
    input.focus(); // bare keyboard focus must NOT open the panel...
    expect(screen.queryByText("GreenKeeper AI")).not.toBeInTheDocument();
    await user.keyboard("hey"); // ...but typing does
    expect(screen.getByText("GreenKeeper AI")).toBeInTheDocument();
  });

  it("sends the typed message and clears the input", async () => {
    const { user } = render(<AssistantBar />);
    const input = screen.getByLabelText("Ask the AI assistant");
    await user.type(input, "Order more bunker sand");
    await user.click(screen.getByLabelText("Send"));
    expect(sendMessage).toHaveBeenCalledWith("Order more bunker sand");
    expect(input).toHaveValue("");
  });

  it("does not send an empty message", async () => {
    const { user } = render(<AssistantBar />);
    const input = screen.getByLabelText("Ask the AI assistant");
    await user.click(input);
    // Send button is disabled with no text — clicking fires nothing
    await user.click(screen.getByLabelText("Send"));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("has an attach-spreadsheet button wired to the hidden file input", () => {
    render(<AssistantBar />);
    expect(screen.getByLabelText("Attach spreadsheet")).toBeInTheDocument();
  });

  it("shows the pending spreadsheet chip and enables Send without text", async () => {
    mockChat.pendingSpreadsheet = {
      file: new File(["a,b"], "usf-order.xlsx"),
      data: {
        name: "usf-order.xlsx",
        text: "a,b",
        rowCount: 42,
        sheetCount: 1,
        truncated: false,
      },
    };
    const { user } = render(<AssistantBar />);
    await user.click(screen.getByLabelText("Ask the AI assistant"));
    expect(screen.getByText("usf-order.xlsx")).toBeInTheDocument();
    expect(screen.getByText(/42 rows/)).toBeInTheDocument();
    expect(screen.getByLabelText("Send")).toBeEnabled();
    await user.click(screen.getByLabelText("Send"));
    expect(sendMessage).toHaveBeenCalledWith("");
  });

  it("surfaces attachment errors in the panel", async () => {
    mockChat.attachError = "broken.xlsx has no readable rows — is it a valid spreadsheet?";
    const { user } = render(<AssistantBar />);
    await user.click(screen.getByLabelText("Ask the AI assistant"));
    expect(screen.getByText(/no readable rows/)).toBeInTheDocument();
  });

  it("shows the conversation and a Clear button when messages exist", async () => {
    mockChat.messages = [
      {
        id: "m1",
        role: "user",
        content: "Fix the sprinkler on 7",
        timestamp: new Date(),
      },
      {
        id: "m2",
        role: "assistant",
        content: "Done — task created.",
        timestamp: new Date(),
      },
    ];
    const { user } = render(<AssistantBar />);
    await user.click(screen.getByLabelText("Ask the AI assistant"));
    expect(screen.getByText("Fix the sprinkler on 7")).toBeInTheDocument();
    expect(screen.getByText("Done — task created.")).toBeInTheDocument();
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("offers Stop instead of Send while a reply is loading", () => {
    mockChat.loading = true;
    render(<AssistantBar />);
    expect(screen.getByLabelText("Stop generating")).toBeInTheDocument();
    expect(screen.queryByLabelText("Send")).not.toBeInTheDocument();
  });

  it("closes the panel with the close button", async () => {
    const { user } = render(<AssistantBar />);
    await user.click(screen.getByLabelText("Ask the AI assistant"));
    expect(screen.getByText("GreenKeeper AI")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Close chat panel"));
    expect(screen.queryByText("GreenKeeper AI")).not.toBeInTheDocument();
  });

  it("links the expand button to the full-screen chat with workspace context", async () => {
    mockPathname = "/staff"; // → people workspace
    const { user } = render(<AssistantBar />);
    await user.click(screen.getByLabelText("Ask the AI assistant"));
    expect(screen.getByLabelText("Open full-screen chat")).toHaveAttribute(
      "href",
      "/assistant?ws=people",
    );
  });
});
