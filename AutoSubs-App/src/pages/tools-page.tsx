import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Scissors, Repeat, CaseLower, CaseUpper, MessageCircleX, Speaker, AudioWaveform, WandSparkles, Regex, Repeat2, Loader2 } from "lucide-react";
import { exportAudio, addSilenceMarkers, getSilenceSegments } from "@/api/resolveAPI"; // Import Resolve API functions
import { downloadDir } from "@tauri-apps/api/path";
import { toast } from "sonner"

const SilenceDeletionOptions = ({ onComplete }: { onComplete: () => void }) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const handleMarkSilences = async () => {
        setIsProcessing(true);
        try {
            const outputDir = await downloadDir();
            console.log("Exporting audio to:", outputDir);
            const audioInfo = await exportAudio(outputDir, "0"); // Export all tracks
            console.log("Audio exported:", audioInfo);

            if (!audioInfo || !audioInfo.path || audioInfo.markIn === undefined) {
                 throw new Error("Failed to get required audio file info after export.");
            }

            console.log("Getting silence segments for:", audioInfo.path);
            // Call the Python server endpoint via the frontend
            const nonSpeechSegments = await getSilenceSegments(audioInfo.path);
            console.log("Received non-speech segments:", nonSpeechSegments);

            if (!nonSpeechSegments) {
                throw new Error("Failed to retrieve silence segments.");
            }

            console.log("Calling Lua to add silence markers...");
            // Pass the segments and markIn directly to the Lua function via the updated API call structure
            const message = await addSilenceMarkers({ 
                nonSpeechSegments: nonSpeechSegments, 
                markIn: audioInfo.markIn 
            });
            console.log("Silence marker response:", message);

            toast.success(message || "Silence markers added to the timeline.");
            onComplete(); // Close the dialog on success
        } catch (error) {
            console.error("Error marking silences:", error);
            let errorMessage = "Failed to mark silences on the timeline.";
            if (error instanceof Error) {
              errorMessage = error.message;
            }
            toast.error(errorMessage);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div>
            <p className="text-sm text-muted-foreground mb-4">
                This tool will export the audio from your current timeline, detect silent sections,
                and add markers (Red) at the beginning and end of each significant silence found.
            </p>
            <Button onClick={handleMarkSilences} disabled={isProcessing} className="w-full">
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />} 
                {isProcessing ? "Processing..." : "Mark Silences on Timeline"}
            </Button>
        </div>
    );
};

const tools = [
    {
        id: "silence-deletion", // Unique ID for key prop
        icon: WandSparkles,
        title: "Silence Deletion",
        description: "Add markers to silent sections on your timeline.",
        optionsComponent: SilenceDeletionOptions,
    },
    {
        id: "text-to-speech",
        icon: AudioWaveform,
        title: "Text to Speech",
        description: "Create lifelike voices from text using AI.",
        optionsComponent: () => <div>Options for Text to Speech</div>,
    },
    {
        id: "remove-characters",
        icon: Regex,
        title: "Remove Characters",
        description: "Remove specific characters from subtitles.",
        optionsComponent: () => (
            <div>
                <Textarea placeholder="Enter characters to remove" />
                <Button className="mt-2">Apply</Button>
            </div>
        ),
    },
    {
        id: "remove-repetition",
        icon: Repeat2,
        title: "Remove Repetition",
        description: "Remove repeated words from subtitles.",
        optionsComponent: () => <div>Options for Removing Repetition</div>,
    },
    {
        id: "censor-swear-words",
        icon: MessageCircleX,
        title: "Censor Swear Words",
        description: "Replace swear words with asterisks.",
        optionsComponent: () => <div>Options for Censoring Swear Words</div>,
    },
    {
        id: "lowercase-subtitles",
        icon: CaseLower,
        title: "Lowercase Subtitles",
        description: "Convert all subtitles to lowercase.",
        optionsComponent: () => <div>Confirm applying lowercase</div>,
    },
    {
        id: "uppercase-subtitles",
        icon: CaseUpper,
        title: "Uppercase Subtitles",
        description: "Convert all subtitles to uppercase.",
        optionsComponent: () => <div>Confirm applying Uppercase</div>,
    },
];

export function ToolsPage() {
    const [activeTool, setActiveTool] = useState<null | typeof tools[0]>(null);

    const handleCloseDialog = () => {
      setActiveTool(null);
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 p-4">
            {tools.map((tool) => (
                <Card
                    key={tool.id} // Use unique ID as key
                    className="flex flex-col h-full cursor-pointer transition-all duration-300 hover:shadow-md hover:border-primary"
                    onClick={() => setActiveTool(tool)}
                >
                    <CardContent className="p-5 grid gap-0.5 pb-2.5">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center space-x-2">
                                <div className="p-2 rounded-full">
                                    <tool.icon className="h-8 w-8 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg">{tool.title}</h3>
                                    <p className="text-sm text-muted-foreground">{tool.description}</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}

            {activeTool && (
                <Dialog open={!!activeTool} onOpenChange={handleCloseDialog}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{activeTool.title}</DialogTitle>
                        </DialogHeader>
                        <activeTool.optionsComponent onComplete={handleCloseDialog} />
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
};

export default ToolsPage;
