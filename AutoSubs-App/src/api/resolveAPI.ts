// src/api/resolveAPI.ts
import { fetch } from '@tauri-apps/plugin-http';
import { downloadDir } from '@tauri-apps/api/path';
import type { AudioInfo } from '@/types/interfaces'; // Assuming AudioInfo might be needed

// import error variable from global context
import { useGlobal } from '@/contexts/GlobalContext';

const resolveAPI = "http://localhost:56002/";
const pythonAPI = "http://localhost:56001/"; // Define Python server URL

interface ResolveResponse {
    message?: string;
    // Add other potential response fields based on Lua functions
    path?: string;
    timeline?: string;
    markIn?: number;
    markOut?: number;
}

/**
 * Generic function to call a function in the Resolve Lua script.
 * @param funcName - The name of the Lua function to call.
 * @param params - An object containing parameters for the Lua function.
 * @returns The response from the Lua script.
 */
async function callResolveAPI<T extends ResolveResponse>(funcName: string, params: Record<string, unknown>): Promise<T> {
    console.log(`Calling Resolve API func: ${funcName} with params:`, params);
    try {
        const response = await fetch(resolveAPI, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ func: funcName, ...params }),
        });

        if (!response.ok) {
            throw new Error(`Resolve API HTTP error: ${response.status}`);
        }

        const textResponse = await response.text();
         // Attempt to find JSON start, handling potential non-JSON prefixes/suffixes if necessary
         const jsonStart = textResponse.indexOf('{');
         const jsonEnd = textResponse.lastIndexOf('}');
         if (jsonStart === -1 || jsonEnd === -1) {
             console.error("Received non-JSON response from Resolve API:", textResponse);
             throw new Error("Invalid response from Resolve API: Not JSON");
         }
         const jsonString = textResponse.substring(jsonStart, jsonEnd + 1);


        try {
            const data = JSON.parse(jsonString) as T;
            console.log(`Response from Resolve API func ${funcName}:`, data);
            if (data.message?.toLowerCase().includes("failed")) {
                 throw new Error(data.message);
            }
            return data;
        } catch (parseError) {
            console.error("Failed to parse JSON response from Resolve API:", parseError);
            console.error("Raw response string:", jsonString);
            throw new Error("Failed to parse response from Resolve API.");
        }

    } catch (error) {
        console.error(`Error calling Resolve API function ${funcName}:`, error);
        throw error; // Re-throw the error to be handled by the caller
    }
}

/**
 * Exports audio from the current Resolve timeline.
 * @param outputDir - The directory to save the exported audio file.
 * @param inputTrack - The audio track index to export ("0" for all tracks).
 * @returns An object containing information about the exported audio.
 */
export async function exportAudio(outputDir: string, inputTrack = "0") {
    const response = await callResolveAPI<{
        path: string;
        timeline: string;
        markIn: number;
        markOut: number;
        message?: string;
     }>("ExportAudio", { outputDir, inputTrack });

    if (!response.path) {
        throw new Error(response.message || "Failed to export audio: No path received.");
    }
    // Ensure markIn and markOut are numbers, defaulting to 0 if undefined
    const markIn = response.markIn ?? 0;
    const markOut = response.markOut ?? 0;


    return { path: response.path, timeline: response.timeline, markIn, markOut };
}

// Define the expected structure for silence segments
interface SilenceSegment {
    start: number;
    end: number;
}

// Define the argument type for the updated addSilenceMarkers
interface AddSilenceMarkersArgs {
    nonSpeechSegments: SilenceSegment[];
    markIn: number;
}

/**
 * Fetches silence segments from the Python backend.
 * @param audioFilePath - The path to the audio file to analyze.
 * @returns An array of silence segments.
 */
export async function getSilenceSegments(audioFilePath: string): Promise<SilenceSegment[]> {
    console.log('Calling Python API func: /non_speech_segments/ for:', audioFilePath);
    try {
        const response = await fetch(`${pythonAPI}non_speech_segments/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_file: audioFilePath }), // Python expects 'audio_file'
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Python API HTTP error:", response.status, errorText);
            throw new Error(`Python API HTTP error: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as SilenceSegment[];
        console.log('Response from Python API func /non_speech_segments/:', data);
        return data;
    } catch (error) {
        console.error('Error calling Python API function /non_speech_segments/:', error);
        throw error; // Re-throw the error
    }
}

/**
 * Calls the Lua function to add silence markers to the timeline.
 * @param args - An object containing nonSpeechSegments array and markIn offset.
 * @returns The response message from the Lua script.
 */
export async function addSilenceMarkers(args: AddSilenceMarkersArgs): Promise<string> {
    const { nonSpeechSegments, markIn } = args;
    // Pass the segments and markIn directly in the params object
    const response = await callResolveAPI<ResolveResponse>("AddSilenceMarkers", { 
        nonSpeechSegments: nonSpeechSegments, 
        markIn: markIn 
    });
    return response.message || "Silence marker operation completed.";
}

/**
 * Jumps the timeline playhead to a specific time.
 * @param timeInSeconds - The time in seconds to jump to.
 * @param markInOffset - The mark-in offset of the timeline in frames.
 */
export async function jumpToTime(timeInSeconds: number, markInOffset: number): Promise<string> {
    const response = await callResolveAPI<ResolveResponse>("JumpToTime", { start: timeInSeconds, markIn: markInOffset });
    return response.message || "Jumped to time.";
}

// Add other necessary functions to interact with Resolve (e.g., GetTimelineInfo)
export async function getTimelineInfo() {
    return await callResolveAPI("GetTimelineInfo", {});
}

export async function addSubtitles(filePath: string, currentTemplate: string, outputTrack: string) {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      func: "AddSubtitles",
      filePath,
      templateName: currentTemplate,
      trackIndex: outputTrack,
    }),
  });
  return response.json();
}

export async function closeResolveLink() {
  const response = await fetch(resolveAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ func: "Exit" }),
  });
  return response.json();
}