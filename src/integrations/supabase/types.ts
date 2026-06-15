export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      academic_assessments: {
        Row: {
          assessment_date: string | null
          assessment_type: string
          campus_id: string | null
          class_section_id: string
          created_at: string | null
          created_by: string | null
          id: string
          instructions: string | null
          is_published: boolean | null
          max_marks: number | null
          passing_marks: number | null
          published_at: string | null
          school_id: string
          subject_id: string | null
          term_label: string | null
          title: string
          weightage_percent: number | null
        }
        Insert: {
          assessment_date?: string | null
          assessment_type?: string
          campus_id?: string | null
          class_section_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          instructions?: string | null
          is_published?: boolean | null
          max_marks?: number | null
          passing_marks?: number | null
          published_at?: string | null
          school_id: string
          subject_id?: string | null
          term_label?: string | null
          title: string
          weightage_percent?: number | null
        }
        Update: {
          assessment_date?: string | null
          assessment_type?: string
          campus_id?: string | null
          class_section_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          instructions?: string | null
          is_published?: boolean | null
          max_marks?: number | null
          passing_marks?: number | null
          published_at?: string | null
          school_id?: string
          subject_id?: string | null
          term_label?: string | null
          title?: string
          weightage_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_assessments_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessments_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_classes: {
        Row: {
          created_at: string | null
          grade_level: number | null
          id: string
          name: string
          school_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          grade_level?: number | null
          id?: string
          name: string
          school_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          grade_level?: number | null
          id?: string
          name?: string
          school_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_message_pins: {
        Row: {
          created_at: string | null
          id: string
          message_id: string
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_id: string
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message_id?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_message_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "admin_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_message_pins_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_message_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          message_id: string
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          message_id: string
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          message_id?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "admin_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_message_reactions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_message_recipients: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message_id: string
          read_at: string | null
          recipient_user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message_id: string
          read_at?: string | null
          recipient_user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message_id?: string
          read_at?: string | null
          recipient_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "admin_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_messages: {
        Row: {
          attachment_urls: string[] | null
          campus_id: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          id: string
          priority: string | null
          reply_to_id: string | null
          school_id: string
          sender_user_id: string
          status: string | null
          subject: string
        }
        Insert: {
          attachment_urls?: string[] | null
          campus_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          priority?: string | null
          reply_to_id?: string | null
          school_id: string
          sender_user_id: string
          status?: string | null
          subject: string
        }
        Update: {
          attachment_urls?: string[] | null
          campus_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          priority?: string | null
          reply_to_id?: string | null
          school_id?: string
          sender_user_id?: string
          status?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_messages_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "admin_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_application_documents: {
        Row: {
          application_id: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          school_id: string
          uploaded_by_user_id: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          school_id: string
          uploaded_by_user_id?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          school_id?: string
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "admission_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_applications: {
        Row: {
          applying_for_class_id: string | null
          applying_for_section_id: string | null
          converted_at: string | null
          converted_student_id: string | null
          created_at: string
          date_of_birth: string | null
          decision_notes: string | null
          desired_subjects: string[] | null
          first_name: string
          gender: string | null
          id: string
          last_name: string
          notes: string | null
          parent_address: string | null
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          photo_url: string | null
          previous_school: string | null
          registration_number: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          roll_number: string | null
          school_id: string
          status: Database["public"]["Enums"]["admission_status"]
          submitted_by_user_id: string | null
          updated_at: string
        }
        Insert: {
          applying_for_class_id?: string | null
          applying_for_section_id?: string | null
          converted_at?: string | null
          converted_student_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          decision_notes?: string | null
          desired_subjects?: string[] | null
          first_name: string
          gender?: string | null
          id?: string
          last_name: string
          notes?: string | null
          parent_address?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          previous_school?: string | null
          registration_number?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          roll_number?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["admission_status"]
          submitted_by_user_id?: string | null
          updated_at?: string
        }
        Update: {
          applying_for_class_id?: string | null
          applying_for_section_id?: string | null
          converted_at?: string | null
          converted_student_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          decision_notes?: string | null
          desired_subjects?: string[] | null
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          notes?: string | null
          parent_address?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          previous_school?: string | null
          registration_number?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          roll_number?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["admission_status"]
          submitted_by_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_academic_predictions: {
        Row: {
          confidence: number | null
          created_at: string | null
          factors: Json | null
          failure_risk: number | null
          id: string
          predicted_grade: string | null
          promotion_probability: number | null
          school_id: string
          student_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          factors?: Json | null
          failure_risk?: number | null
          id?: string
          predicted_grade?: string | null
          promotion_probability?: number | null
          school_id: string
          student_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          factors?: Json | null
          failure_risk?: number | null
          id?: string
          predicted_grade?: string | null
          promotion_probability?: number | null
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_academic_predictions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_academic_predictions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_career_suggestions: {
        Row: {
          analysis_data: Json | null
          confidence: number | null
          created_at: string | null
          id: string
          interests: string[] | null
          recommended_subjects: string[] | null
          school_id: string
          strengths: string[] | null
          student_id: string
          suggested_careers: Json | null
          updated_at: string | null
        }
        Insert: {
          analysis_data?: Json | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          interests?: string[] | null
          recommended_subjects?: string[] | null
          school_id: string
          strengths?: string[] | null
          student_id: string
          suggested_careers?: Json | null
          updated_at?: string | null
        }
        Update: {
          analysis_data?: Json | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          interests?: string[] | null
          recommended_subjects?: string[] | null
          school_id?: string
          strengths?: string[] | null
          student_id?: string
          suggested_careers?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_career_suggestions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_career_suggestions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_counseling_queue: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          detected_indicators: string[] | null
          id: string
          notes: string | null
          outcome: string | null
          priority: string | null
          reason: string | null
          reason_details: string | null
          reason_type: string | null
          scheduled_date: string | null
          school_id: string
          session_notes: string | null
          status: string | null
          student_id: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          detected_indicators?: string[] | null
          id?: string
          notes?: string | null
          outcome?: string | null
          priority?: string | null
          reason?: string | null
          reason_details?: string | null
          reason_type?: string | null
          scheduled_date?: string | null
          school_id: string
          session_notes?: string | null
          status?: string | null
          student_id: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          detected_indicators?: string[] | null
          id?: string
          notes?: string | null
          outcome?: string | null
          priority?: string | null
          reason?: string | null
          reason_details?: string | null
          reason_type?: string | null
          scheduled_date?: string | null
          school_id?: string
          session_notes?: string | null
          status?: string | null
          student_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_counseling_queue_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_counseling_queue_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_early_warnings: {
        Row: {
          acknowledged_at: string | null
          created_at: string | null
          description: string | null
          detected_patterns: string[] | null
          id: string
          recommended_actions: string[] | null
          resolved_at: string | null
          school_id: string
          severity: string | null
          status: string | null
          student_id: string
          title: string | null
          warning_type: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string | null
          description?: string | null
          detected_patterns?: string[] | null
          id?: string
          recommended_actions?: string[] | null
          resolved_at?: string | null
          school_id: string
          severity?: string | null
          status?: string | null
          student_id: string
          title?: string | null
          warning_type: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string | null
          description?: string | null
          detected_patterns?: string[] | null
          id?: string
          recommended_actions?: string[] | null
          resolved_at?: string | null
          school_id?: string
          severity?: string | null
          status?: string | null
          student_id?: string
          title?: string | null
          warning_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_early_warnings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_early_warnings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_parent_updates: {
        Row: {
          ai_summary: string | null
          attendance_status: string | null
          behavior_remarks: string | null
          content: string | null
          created_at: string | null
          focus_trend: string | null
          id: string
          is_sent: boolean | null
          key_insights: string[] | null
          parent_user_id: string | null
          participation_level: string | null
          performance_change_percent: number | null
          recommendations: string[] | null
          school_id: string
          sent_at: string | null
          student_id: string | null
          teacher_notes: string | null
          update_date: string | null
          update_type: string | null
        }
        Insert: {
          ai_summary?: string | null
          attendance_status?: string | null
          behavior_remarks?: string | null
          content?: string | null
          created_at?: string | null
          focus_trend?: string | null
          id?: string
          is_sent?: boolean | null
          key_insights?: string[] | null
          parent_user_id?: string | null
          participation_level?: string | null
          performance_change_percent?: number | null
          recommendations?: string[] | null
          school_id: string
          sent_at?: string | null
          student_id?: string | null
          teacher_notes?: string | null
          update_date?: string | null
          update_type?: string | null
        }
        Update: {
          ai_summary?: string | null
          attendance_status?: string | null
          behavior_remarks?: string | null
          content?: string | null
          created_at?: string | null
          focus_trend?: string | null
          id?: string
          is_sent?: boolean | null
          key_insights?: string[] | null
          parent_user_id?: string | null
          participation_level?: string | null
          performance_change_percent?: number | null
          recommendations?: string[] | null
          school_id?: string
          sent_at?: string | null
          student_id?: string | null
          teacher_notes?: string | null
          update_date?: string | null
          update_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_parent_updates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_parent_updates_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_school_reputation: {
        Row: {
          academic_score: number | null
          analysis_data: Json | null
          community_score: number | null
          created_at: string | null
          id: string
          improvements: string[] | null
          last_analyzed_at: string | null
          nps_score: number | null
          overall_score: number | null
          parent_satisfaction: number | null
          parent_satisfaction_index: number | null
          reputation_score: number | null
          school_id: string
          strengths: string[] | null
          updated_at: string | null
        }
        Insert: {
          academic_score?: number | null
          analysis_data?: Json | null
          community_score?: number | null
          created_at?: string | null
          id?: string
          improvements?: string[] | null
          last_analyzed_at?: string | null
          nps_score?: number | null
          overall_score?: number | null
          parent_satisfaction?: number | null
          parent_satisfaction_index?: number | null
          reputation_score?: number | null
          school_id: string
          strengths?: string[] | null
          updated_at?: string | null
        }
        Update: {
          academic_score?: number | null
          analysis_data?: Json | null
          community_score?: number | null
          created_at?: string | null
          id?: string
          improvements?: string[] | null
          last_analyzed_at?: string | null
          nps_score?: number | null
          overall_score?: number | null
          parent_satisfaction?: number | null
          parent_satisfaction_index?: number | null
          reputation_score?: number | null
          school_id?: string
          strengths?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_school_reputation_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_student_profiles: {
        Row: {
          analysis_data: Json | null
          created_at: string | null
          id: string
          last_analyzed_at: string | null
          learning_style: string | null
          needs_counseling: boolean | null
          needs_extra_support: boolean | null
          personality_type: string | null
          risk_level: string | null
          risk_score: number | null
          school_id: string
          strengths: string[] | null
          student_id: string
          updated_at: string | null
          weaknesses: string[] | null
        }
        Insert: {
          analysis_data?: Json | null
          created_at?: string | null
          id?: string
          last_analyzed_at?: string | null
          learning_style?: string | null
          needs_counseling?: boolean | null
          needs_extra_support?: boolean | null
          personality_type?: string | null
          risk_level?: string | null
          risk_score?: number | null
          school_id: string
          strengths?: string[] | null
          student_id: string
          updated_at?: string | null
          weaknesses?: string[] | null
        }
        Update: {
          analysis_data?: Json | null
          created_at?: string | null
          id?: string
          last_analyzed_at?: string | null
          learning_style?: string | null
          needs_counseling?: boolean | null
          needs_extra_support?: boolean | null
          personality_type?: string | null
          risk_level?: string | null
          risk_score?: number | null
          school_id?: string
          strengths?: string[] | null
          student_id?: string
          updated_at?: string | null
          weaknesses?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_student_profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_student_profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_teacher_performance: {
        Row: {
          analysis_data: Json | null
          attendance_score: number | null
          created_at: string | null
          engagement_score: number | null
          feedback: string | null
          id: string
          last_analyzed_at: string | null
          needs_training: boolean | null
          overall_score: number | null
          results_score: number | null
          school_id: string
          teacher_user_id: string
          updated_at: string | null
        }
        Insert: {
          analysis_data?: Json | null
          attendance_score?: number | null
          created_at?: string | null
          engagement_score?: number | null
          feedback?: string | null
          id?: string
          last_analyzed_at?: string | null
          needs_training?: boolean | null
          overall_score?: number | null
          results_score?: number | null
          school_id: string
          teacher_user_id: string
          updated_at?: string | null
        }
        Update: {
          analysis_data?: Json | null
          attendance_score?: number | null
          created_at?: string | null
          engagement_score?: number | null
          feedback?: string | null
          id?: string
          last_analyzed_at?: string | null
          needs_training?: boolean | null
          overall_score?: number | null
          results_score?: number | null
          school_id?: string
          teacher_user_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_teacher_performance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      app_notifications: {
        Row: {
          body: string | null
          campus_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          read_at: string | null
          school_id: string
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          campus_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          school_id: string
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          campus_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          school_id?: string
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_notifications_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          attachment_urls: string[] | null
          content: string | null
          created_at: string | null
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          marks: number | null
          marks_before_penalty: number | null
          marks_obtained: number | null
          penalty_applied: number | null
          school_id: string
          status: string | null
          student_id: string
          submitted_at: string | null
        }
        Insert: {
          assignment_id: string
          attachment_urls?: string[] | null
          content?: string | null
          created_at?: string | null
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          marks?: number | null
          marks_before_penalty?: number | null
          marks_obtained?: number | null
          penalty_applied?: number | null
          school_id: string
          status?: string | null
          student_id: string
          submitted_at?: string | null
        }
        Update: {
          assignment_id?: string
          attachment_urls?: string[] | null
          content?: string | null
          created_at?: string | null
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          marks?: number | null
          marks_before_penalty?: number | null
          marks_obtained?: number | null
          penalty_applied?: number | null
          school_id?: string
          status?: string | null
          student_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          attachment_urls: string[] | null
          campus_id: string | null
          class_section_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          max_marks: number | null
          school_id: string
          status: string | null
          teacher_user_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          attachment_urls?: string[] | null
          campus_id?: string | null
          class_section_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          max_marks?: number | null
          school_id: string
          status?: string | null
          teacher_user_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          attachment_urls?: string[] | null
          campus_id?: string | null
          class_section_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          max_marks?: number | null
          school_id?: string
          status?: string | null
          teacher_user_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_entries: {
        Row: {
          campus_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          note: string | null
          school_id: string
          session_id: string
          status: string
          student_id: string
        }
        Insert: {
          campus_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string | null
          school_id: string
          session_id: string
          status?: string
          student_id: string
        }
        Update: {
          campus_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string | null
          school_id?: string
          session_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_entries_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_entries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_entries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          campus_id: string | null
          class_section_id: string
          created_at: string | null
          created_by: string | null
          id: string
          period_label: string | null
          school_id: string
          session_date: string
        }
        Insert: {
          campus_id?: string | null
          class_section_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          period_label?: string | null
          school_id: string
          session_date: string
        }
        Update: {
          campus_id?: string | null
          class_section_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          period_label?: string | null
          school_id?: string
          session_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      behavior_notes: {
        Row: {
          campus_id: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_shared_with_parents: boolean | null
          note_type: string | null
          school_id: string
          student_id: string
          teacher_user_id: string | null
          title: string
        }
        Insert: {
          campus_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_shared_with_parents?: boolean | null
          note_type?: string | null
          school_id: string
          student_id: string
          teacher_user_id?: string | null
          title: string
        }
        Update: {
          campus_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_shared_with_parents?: boolean | null
          note_type?: string | null
          school_id?: string
          student_id?: string
          teacher_user_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavior_notes_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "behavior_notes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "behavior_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      campuses: {
        Row: {
          address: string | null
          code: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          principal_user_id: string | null
          school_id: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          principal_user_id?: string | null
          school_id: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          principal_user_id?: string | null
          school_id?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campuses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_section_subjects: {
        Row: {
          class_section_id: string
          created_at: string | null
          id: string
          school_id: string
          subject_id: string
        }
        Insert: {
          class_section_id: string
          created_at?: string | null
          id?: string
          school_id: string
          subject_id: string
        }
        Update: {
          class_section_id?: string
          created_at?: string | null
          id?: string
          school_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_section_subjects_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_section_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_section_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      class_sections: {
        Row: {
          campus_id: string | null
          class_id: string
          created_at: string | null
          id: string
          name: string
          room: string | null
          school_id: string
          updated_at: string | null
        }
        Insert: {
          campus_id?: string | null
          class_id: string
          created_at?: string | null
          id?: string
          name: string
          room?: string | null
          school_id: string
          updated_at?: string | null
        }
        Update: {
          campus_id?: string | null
          class_id?: string
          created_at?: string | null
          id?: string
          name?: string
          room?: string | null
          school_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_sections_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "academic_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sections_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_class_sections_campus"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_feedbacks: {
        Row: {
          author_role: string
          author_user_id: string
          complaint_id: string
          content: string
          created_at: string
          id: string
          school_id: string
          updated_at: string
        }
        Insert: {
          author_role: string
          author_user_id: string
          complaint_id: string
          content: string
          created_at?: string
          id?: string
          school_id: string
          updated_at?: string
        }
        Update: {
          author_role?: string
          author_user_id?: string
          complaint_id?: string
          content?: string
          created_at?: string
          id?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_feedbacks_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_feedbacks_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints_principal_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_feedbacks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          anonymous: boolean
          attachments: Json | null
          campus_id: string | null
          category: string | null
          content: string
          created_at: string
          flow: string
          id: string
          priority: string
          rating: number | null
          rating_comment: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          school_id: string
          sender_user_id: string
          status: string
          student_id: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          anonymous?: boolean
          attachments?: Json | null
          campus_id?: string | null
          category?: string | null
          content: string
          created_at?: string
          flow: string
          id?: string
          priority?: string
          rating?: number | null
          rating_comment?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          school_id: string
          sender_user_id: string
          status?: string
          student_id?: string | null
          subject: string
          updated_at?: string
        }
        Update: {
          anonymous?: boolean
          attachments?: Json | null
          campus_id?: string | null
          category?: string | null
          content?: string
          created_at?: string
          flow?: string
          id?: string
          priority?: string
          rating?: number | null
          rating_comment?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string
          sender_user_id?: string
          status?: string
          student_id?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          activity_type: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          due_at: string | null
          id: string
          lead_id: string
          school_id: string
          summary: string | null
        }
        Insert: {
          activity_type: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          due_at?: string | null
          id?: string
          lead_id: string
          school_id: string
          summary?: string | null
        }
        Update: {
          activity_type?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string
          school_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_call_logs: {
        Row: {
          called_at: string | null
          created_at: string | null
          created_by: string | null
          duration_seconds: number | null
          id: string
          lead_id: string
          notes: string | null
          outcome: string | null
          school_id: string
        }
        Insert: {
          called_at?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          lead_id: string
          notes?: string | null
          outcome?: string | null
          school_id: string
        }
        Update: {
          called_at?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          lead_id?: string
          notes?: string | null
          outcome?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_call_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_call_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_campaigns: {
        Row: {
          budget: number | null
          channel: string | null
          created_at: string | null
          end_date: string | null
          id: string
          name: string
          school_id: string
          start_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          budget?: number | null
          channel?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          name: string
          school_id: string
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          budget?: number | null
          channel?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          name?: string
          school_id?: string
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_campaigns_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_follow_ups: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          id: string
          lead_id: string
          notes: string | null
          scheduled_at: string
          school_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          lead_id: string
          notes?: string | null
          scheduled_at: string
          school_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
          scheduled_at?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_follow_ups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_follow_ups_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_attributions: {
        Row: {
          campaign_id: string
          created_at: string | null
          id: string
          lead_id: string
          school_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          id?: string
          lead_id: string
          school_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          id?: string
          lead_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_attributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crm_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_lead_attributions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_lead_attributions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_sources: {
        Row: {
          created_at: string | null
          id: string
          name: string
          school_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          school_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_sources_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          next_follow_up_at: string | null
          notes: string | null
          phone: string | null
          pipeline_id: string | null
          school_id: string
          score: number | null
          source: string | null
          stage_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          next_follow_up_at?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_id?: string | null
          school_id: string
          score?: number | null
          source?: string | null
          stage_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          next_follow_up_at?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_id?: string | null
          school_id?: string
          score?: number | null
          source?: string | null
          stage_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipelines: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          school_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          school_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipelines_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_stages: {
        Row: {
          created_at: string | null
          id: string
          name: string
          pipeline_id: string
          school_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          pipeline_id: string
          school_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          pipeline_id?: string
          school_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      diary_entries: {
        Row: {
          category: string | null
          class_section_id: string | null
          content: string | null
          created_at: string
          entry_date: string
          id: string
          school_id: string
          subject_id: string | null
          teacher_user_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          class_section_id?: string | null
          content?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          school_id: string
          subject_id?: string | null
          teacher_user_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          class_section_id?: string | null
          content?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          school_id?: string
          subject_id?: string | null
          teacher_user_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diary_entries_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diary_entries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diary_entries_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      easypaisa_settings: {
        Row: {
          account_number: string | null
          created_at: string
          environment: Database["public"]["Enums"]["easypaisa_env"]
          hash_key: string | null
          id: string
          is_enabled: boolean
          return_url: string | null
          school_id: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          created_at?: string
          environment?: Database["public"]["Enums"]["easypaisa_env"]
          hash_key?: string | null
          id?: string
          is_enabled?: boolean
          return_url?: string | null
          school_id: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          created_at?: string
          environment?: Database["public"]["Enums"]["easypaisa_env"]
          hash_key?: string | null
          id?: string
          is_enabled?: boolean
          return_url?: string | null
          school_id?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      easypaisa_transactions: {
        Row: {
          amount: number
          created_at: string
          ep_response_code: string | null
          ep_response_message: string | null
          id: string
          initiator_user_id: string | null
          invoice_id: string
          order_ref_no: string
          raw_request: Json | null
          raw_response: Json | null
          school_id: string
          status: Database["public"]["Enums"]["fee_payment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          ep_response_code?: string | null
          ep_response_message?: string | null
          id?: string
          initiator_user_id?: string | null
          invoice_id: string
          order_ref_no: string
          raw_request?: Json | null
          raw_response?: Json | null
          school_id: string
          status?: Database["public"]["Enums"]["fee_payment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          ep_response_code?: string | null
          ep_response_message?: string | null
          id?: string
          initiator_user_id?: string | null
          invoice_id?: string
          order_ref_no?: string
          raw_request?: Json | null
          raw_response?: Json | null
          school_id?: string
          status?: Database["public"]["Enums"]["fee_payment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "easypaisa_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "fee_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_datesheet_distributions: {
        Row: {
          class_section_id: string | null
          exam_id: string
          file_path: string
          generated_at: string
          generated_by: string | null
          id: string
          notes: string | null
          notified_at: string | null
          notify_at: string | null
          school_id: string
          student_id: string
        }
        Insert: {
          class_section_id?: string | null
          exam_id: string
          file_path: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          notify_at?: string | null
          school_id: string
          student_id: string
        }
        Update: {
          class_section_id?: string | null
          exam_id?: string
          file_path?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          notify_at?: string | null
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_datesheet_distributions_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_datesheet_distributions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_datesheet_distributions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_datesheet_distributions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_result_publications: {
        Row: {
          class_section_id: string | null
          created_at: string
          created_by: string | null
          exam_id: string
          id: string
          is_published: boolean
          notes: string | null
          processed_at: string | null
          publish_at: string | null
          school_id: string
          scope: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          class_section_id?: string | null
          created_at?: string
          created_by?: string | null
          exam_id: string
          id?: string
          is_published?: boolean
          notes?: string | null
          processed_at?: string | null
          publish_at?: string | null
          school_id: string
          scope: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          class_section_id?: string | null
          created_at?: string
          created_by?: string | null
          exam_id?: string
          id?: string
          is_published?: boolean
          notes?: string | null
          processed_at?: string | null
          publish_at?: string | null
          school_id?: string
          scope?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_result_publications_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_result_publications_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_result_publications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_result_publications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_results: {
        Row: {
          created_at: string
          exam_id: string
          grade: string | null
          graded_by: string | null
          id: string
          marks_obtained: number | null
          max_marks: number | null
          remarks: string | null
          school_id: string
          student_id: string
          subject_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          grade?: string | null
          graded_by?: string | null
          id?: string
          marks_obtained?: number | null
          max_marks?: number | null
          remarks?: string | null
          school_id: string
          student_id: string
          subject_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          grade?: string | null
          graded_by?: string | null
          id?: string
          marks_obtained?: number | null
          max_marks?: number | null
          remarks?: string | null
          school_id?: string
          student_id?: string
          subject_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_seat_allocations: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          roll_number: string | null
          room: string | null
          school_id: string
          seat_number: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          roll_number?: string | null
          room?: string | null
          school_id: string
          seat_number?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          roll_number?: string | null
          room?: string | null
          school_id?: string
          seat_number?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_seat_allocations_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_seat_allocations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_seat_allocations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_subjects: {
        Row: {
          class_section_id: string | null
          created_at: string
          duration_minutes: number | null
          exam_date: string | null
          exam_id: string
          id: string
          instructions: string | null
          invigilator_user_id: string | null
          max_marks: number | null
          passing_marks: number | null
          room: string | null
          school_id: string
          start_time: string | null
          subject_id: string | null
        }
        Insert: {
          class_section_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          exam_date?: string | null
          exam_id: string
          id?: string
          instructions?: string | null
          invigilator_user_id?: string | null
          max_marks?: number | null
          passing_marks?: number | null
          room?: string | null
          school_id: string
          start_time?: string | null
          subject_id?: string | null
        }
        Update: {
          class_section_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          exam_date?: string | null
          exam_id?: string
          id?: string
          instructions?: string | null
          invigilator_user_id?: string | null
          max_marks?: number | null
          passing_marks?: number | null
          room?: string | null
          school_id?: string
          start_time?: string | null
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_subjects_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_subjects_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          academic_year: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          instructions: string | null
          name: string
          passing_percentage: number | null
          result_published: boolean
          result_published_at: string | null
          school_id: string
          start_date: string | null
          status: string
          term_label: string | null
          updated_at: string
        }
        Insert: {
          academic_year?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          instructions?: string | null
          name: string
          passing_percentage?: number | null
          result_published?: boolean
          result_published_at?: string | null
          school_id: string
          start_date?: string | null
          status?: string
          term_label?: string | null
          updated_at?: string
        }
        Update: {
          academic_year?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          instructions?: string | null
          name?: string
          passing_percentage?: number | null
          result_published?: boolean
          result_published_at?: string | null
          school_id?: string
          start_date?: string | null
          status?: string
          term_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_invoice_items: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["fee_item_category"]
          id: string
          invoice_id: string
          label: string
          school_id: string
          sort_order: number
        }
        Insert: {
          amount?: number
          category?: Database["public"]["Enums"]["fee_item_category"]
          id?: string
          invoice_id: string
          label: string
          school_id: string
          sort_order?: number
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["fee_item_category"]
          id?: string
          invoice_id?: string
          label?: string
          school_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "fee_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_invoices: {
        Row: {
          "Waiver": number
          amount: number
          campus_id: string | null
          created_at: string
          discount_amount: number
          due_date: string
          fee_plan_id: string | null
          id: string
          invoice_number: string
          late_fee: number
          merit_discount_amount: number
          merit_discount_reason: string | null
          notes: string | null
          paid_amount: number
          period_end: string | null
          period_label: string | null
          period_start: string | null
          school_id: string
          sibling_discount_amount: number
          status: Database["public"]["Enums"]["fee_invoice_status"]
          student_id: string
          subtotal: number
          total_amount: number
          updated_at: string
          waiver: number
        }
        Insert: {
          "Waiver"?: number
          amount?: number
          campus_id?: string | null
          created_at?: string
          discount_amount?: number
          due_date: string
          fee_plan_id?: string | null
          id?: string
          invoice_number: string
          late_fee?: number
          merit_discount_amount?: number
          merit_discount_reason?: string | null
          notes?: string | null
          paid_amount?: number
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          school_id: string
          sibling_discount_amount?: number
          status?: Database["public"]["Enums"]["fee_invoice_status"]
          student_id: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          waiver?: number
        }
        Update: {
          "Waiver"?: number
          amount?: number
          campus_id?: string | null
          created_at?: string
          discount_amount?: number
          due_date?: string
          fee_plan_id?: string | null
          id?: string
          invoice_number?: string
          late_fee?: number
          merit_discount_amount?: number
          merit_discount_reason?: string | null
          notes?: string | null
          paid_amount?: number
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          school_id?: string
          sibling_discount_amount?: number
          status?: Database["public"]["Enums"]["fee_invoice_status"]
          student_id?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          waiver?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_invoices_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_invoices_fee_plan_id_fkey"
            columns: ["fee_plan_id"]
            isOneToOne: false
            referencedRelation: "fee_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_payment_proofs: {
        Row: {
          amount: number
          created_at: string
          file_name: string | null
          file_path: string
          id: string
          invoice_id: string
          method: string | null
          mime_type: string | null
          note: string | null
          paid_at: string | null
          payment_id: string | null
          rejection_reason: string | null
          school_id: string
          status: string
          student_id: string
          updated_at: string
          uploaded_by: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          file_name?: string | null
          file_path: string
          id?: string
          invoice_id: string
          method?: string | null
          mime_type?: string | null
          note?: string | null
          paid_at?: string | null
          payment_id?: string | null
          rejection_reason?: string | null
          school_id: string
          status?: string
          student_id: string
          updated_at?: string
          uploaded_by: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          file_name?: string | null
          file_path?: string
          id?: string
          invoice_id?: string
          method?: string | null
          mime_type?: string | null
          note?: string | null
          paid_at?: string | null
          payment_id?: string | null
          rejection_reason?: string | null
          school_id?: string
          status?: string
          student_id?: string
          updated_at?: string
          uploaded_by?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_payment_proofs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "fee_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_payments: {
        Row: {
          amount: number
          campus_id: string | null
          created_at: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["fee_payment_method"]
          notes: string | null
          paid_at: string
          recorded_by_user_id: string | null
          school_id: string
          status: Database["public"]["Enums"]["fee_payment_status"]
          student_id: string
          transaction_ref: string | null
        }
        Insert: {
          amount: number
          campus_id?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          method?: Database["public"]["Enums"]["fee_payment_method"]
          notes?: string | null
          paid_at?: string
          recorded_by_user_id?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["fee_payment_status"]
          student_id: string
          transaction_ref?: string | null
        }
        Update: {
          amount?: number
          campus_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["fee_payment_method"]
          notes?: string | null
          paid_at?: string
          recorded_by_user_id?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["fee_payment_status"]
          student_id?: string
          transaction_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "fee_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_plan_installments: {
        Row: {
          amount: number
          created_at: string | null
          due_date: string | null
          fee_plan_id: string
          id: string
          label: string
          school_id: string
          sort_order: number | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          due_date?: string | null
          fee_plan_id: string
          id?: string
          label: string
          school_id: string
          sort_order?: number | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          due_date?: string | null
          fee_plan_id?: string
          id?: string
          label?: string
          school_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_plan_installments_fee_plan_id_fkey"
            columns: ["fee_plan_id"]
            isOneToOne: false
            referencedRelation: "fee_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_plan_installments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_plan_items: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["fee_item_category"]
          created_at: string
          fee_plan_id: string
          id: string
          is_recurring: boolean
          label: string
          school_id: string
          sort_order: number
        }
        Insert: {
          amount?: number
          category?: Database["public"]["Enums"]["fee_item_category"]
          created_at?: string
          fee_plan_id: string
          id?: string
          is_recurring?: boolean
          label: string
          school_id: string
          sort_order?: number
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["fee_item_category"]
          created_at?: string
          fee_plan_id?: string
          id?: string
          is_recurring?: boolean
          label?: string
          school_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_plan_items_fee_plan_id_fkey"
            columns: ["fee_plan_id"]
            isOneToOne: false
            referencedRelation: "fee_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_plans: {
        Row: {
          billing_frequency: Database["public"]["Enums"]["fee_billing_frequency"]
          class_id: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          school_id: string
          school_year: string | null
          updated_at: string | null
        }
        Insert: {
          billing_frequency?: Database["public"]["Enums"]["fee_billing_frequency"]
          class_id?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          school_id: string
          school_year?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_frequency?: Database["public"]["Enums"]["fee_billing_frequency"]
          class_id?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          school_id?: string
          school_year?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_plans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_settings: {
        Row: {
          bank_account_number: string | null
          bank_account_title: string | null
          bank_branch: string | null
          bank_iban: string | null
          bank_name: string | null
          bank_swift: string | null
          created_at: string
          currency: string
          id: string
          invoice_prefix: string
          late_fee_amount: number
          late_fee_enabled: boolean
          late_fee_grace_days: number
          school_id: string
          sibling_discount_2nd_pct: number
          sibling_discount_3rd_plus_pct: number
          updated_at: string
          voucher_footer_note: string | null
        }
        Insert: {
          bank_account_number?: string | null
          bank_account_title?: string | null
          bank_branch?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_swift?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_prefix?: string
          late_fee_amount?: number
          late_fee_enabled?: boolean
          late_fee_grace_days?: number
          school_id: string
          sibling_discount_2nd_pct?: number
          sibling_discount_3rd_plus_pct?: number
          updated_at?: string
          voucher_footer_note?: string | null
        }
        Update: {
          bank_account_number?: string | null
          bank_account_title?: string | null
          bank_branch?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_swift?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_prefix?: string
          late_fee_amount?: number
          late_fee_enabled?: boolean
          late_fee_grace_days?: number
          school_id?: string
          sibling_discount_2nd_pct?: number
          sibling_discount_3rd_plus_pct?: number
          updated_at?: string
          voucher_footer_note?: string | null
        }
        Relationships: []
      }
      fee_voucher_batches: {
        Row: {
          campus_id: string | null
          class_id: string | null
          class_section_id: string | null
          created_at: string
          created_by: string
          default_discount_pct: number
          discount_pct: number | null
          due_date: string
          fee_plan_id: string | null
          grade_discount_tiers: Json
          id: string
          min_grade: string | null
          notes: string | null
          period_label: string | null
          school_id: string
          scope: string
          sectionId: string | null
          total_amount: number
          total_students: number
        }
        Insert: {
          campus_id?: string | null
          class_id?: string | null
          class_section_id?: string | null
          created_at?: string
          created_by?: string
          default_discount_pct?: number
          discount_pct?: number | null
          due_date: string
          fee_plan_id?: string | null
          grade_discount_tiers?: Json
          id?: string
          min_grade?: string | null
          notes?: string | null
          period_label?: string | null
          school_id: string
          scope?: string
          sectionId?: string | null
          total_amount?: number
          total_students?: number
        }
        Update: {
          campus_id?: string | null
          class_id?: string | null
          class_section_id?: string | null
          created_at?: string
          created_by?: string
          default_discount_pct?: number
          discount_pct?: number | null
          due_date?: string
          fee_plan_id?: string | null
          grade_discount_tiers?: Json
          id?: string
          min_grade?: string | null
          notes?: string | null
          period_label?: string | null
          school_id?: string
          scope?: string
          sectionId?: string | null
          total_amount?: number
          total_students?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_voucher_batches_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_voucher_batches_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "academic_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_voucher_batches_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_voucher_batches_fee_plan_id_fkey"
            columns: ["fee_plan_id"]
            isOneToOne: false
            referencedRelation: "fee_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_voucher_batches_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_voucher_deliveries: {
        Row: {
          app_notification_id: string | null
          batch_id: string | null
          channel: string
          created_at: string
          delivered_at: string
          error: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_user_id: string | null
          id: string
          invoice_id: string
          parent_notification_id: string | null
          school_id: string
          status: string
          student_id: string
        }
        Insert: {
          app_notification_id?: string | null
          batch_id?: string | null
          channel?: string
          created_at?: string
          delivered_at?: string
          error?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_user_id?: string | null
          id?: string
          invoice_id: string
          parent_notification_id?: string | null
          school_id: string
          status?: string
          student_id: string
        }
        Update: {
          app_notification_id?: string | null
          batch_id?: string | null
          channel?: string
          created_at?: string
          delivered_at?: string
          error?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_user_id?: string | null
          id?: string
          invoice_id?: string
          parent_notification_id?: string | null
          school_id?: string
          status?: string
          student_id?: string
        }
        Relationships: []
      }
      finance_expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          expense_date: string | null
          id: string
          school_id: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expense_date?: string | null
          id?: string
          school_id: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expense_date?: string | null
          id?: string
          school_id?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_expenses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_invoice_items: {
        Row: {
          amount: number
          created_at: string | null
          description: string
          id: string
          invoice_id: string
          quantity: number | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          description: string
          id?: string
          invoice_id: string
          quantity?: number | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_invoices: {
        Row: {
          created_at: string | null
          created_by: string | null
          discount_total: number
          due_date: string | null
          id: string
          instructions: string | null
          invoice_no: string | null
          is_active: boolean
          issue_date: string | null
          late_fee_total: number
          notes: string | null
          school_id: string
          status: string | null
          student_id: string
          subtotal: number | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          discount_total?: number
          due_date?: string | null
          id?: string
          instructions?: string | null
          invoice_no?: string | null
          is_active?: boolean
          issue_date?: string | null
          late_fee_total?: number
          notes?: string | null
          school_id: string
          status?: string | null
          student_id: string
          subtotal?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          discount_total?: number
          due_date?: string | null
          id?: string
          instructions?: string | null
          invoice_no?: string | null
          is_active?: boolean
          issue_date?: string | null
          late_fee_total?: number
          notes?: string | null
          school_id?: string
          status?: string | null
          student_id?: string
          subtotal?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_payment_methods: {
        Row: {
          created_at: string | null
          id: string
          instructions: string | null
          is_active: boolean | null
          name: string
          school_id: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          name: string
          school_id: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          name?: string
          school_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_payment_methods_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          id: string
          invoice_id: string | null
          method_id: string | null
          paid_at: string | null
          reference: string | null
          school_id: string
          student_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          method_id?: string | null
          paid_at?: string | null
          reference?: string | null
          school_id: string
          student_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          method_id?: string | null
          paid_at?: string | null
          reference?: string | null
          school_id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payments_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_thresholds: {
        Row: {
          created_at: string | null
          grade_label: string
          grade_points: number | null
          id: string
          max_percentage: number
          min_percentage: number
          school_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          grade_label: string
          grade_points?: number | null
          id?: string
          max_percentage: number
          min_percentage: number
          school_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          grade_label?: string
          grade_points?: number | null
          id?: string
          max_percentage?: number
          min_percentage?: number
          school_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grade_thresholds_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string
          holiday_type: string | null
          id: string
          school_id: string
          start_date: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date: string
          holiday_type?: string | null
          id?: string
          school_id: string
          start_date: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string
          holiday_type?: string | null
          id?: string
          school_id?: string
          start_date?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      homework: {
        Row: {
          attachment_urls: string[] | null
          class_section_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          school_id: string
          status: string | null
          teacher_user_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          attachment_urls?: string[] | null
          class_section_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          school_id: string
          status?: string | null
          teacher_user_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          attachment_urls?: string[] | null
          class_section_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          school_id?: string
          status?: string | null
          teacher_user_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homework_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_applicants: {
        Row: {
          applied_at: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          posting_id: string | null
          rating: number | null
          resume_url: string | null
          school_id: string
          source: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          applied_at?: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          posting_id?: string | null
          rating?: number | null
          resume_url?: string | null
          school_id: string
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          applied_at?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          posting_id?: string | null
          rating?: number | null
          resume_url?: string | null
          school_id?: string
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_applicants_posting_id_fkey"
            columns: ["posting_id"]
            isOneToOne: false
            referencedRelation: "hr_job_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_asset_assignments: {
        Row: {
          asset_id: string
          condition_on_return: string | null
          created_at: string
          employee_user_id: string
          id: string
          issued_at: string
          issued_by: string | null
          notes: string | null
          returned_at: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          condition_on_return?: string | null
          created_at?: string
          employee_user_id: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          notes?: string | null
          returned_at?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          condition_on_return?: string | null
          created_at?: string
          employee_user_id?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          notes?: string | null
          returned_at?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_asset_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "hr_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_assets: {
        Row: {
          asset_tag: string | null
          category: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          purchase_cost: number | null
          purchase_date: string | null
          school_id: string
          serial_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          asset_tag?: string | null
          category?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          purchase_cost?: number | null
          purchase_date?: string | null
          school_id: string
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          asset_tag?: string | null
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          purchase_cost?: number | null
          purchase_date?: string | null
          school_id?: string
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_attendance_regularizations: {
        Row: {
          attendance_date: string
          created_at: string
          employee_user_id: string
          id: string
          reason: string | null
          requested_status: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attendance_date: string
          created_at?: string
          employee_user_id: string
          id?: string
          reason?: string | null
          requested_status: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          created_at?: string
          employee_user_id?: string
          id?: string
          reason?: string | null
          requested_status?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_contracts: {
        Row: {
          benefits: string | null
          body: string | null
          contract_type: string | null
          created_at: string | null
          department: string | null
          end_date: string | null
          id: string
          notice_period_days: number | null
          position: string | null
          probation_period_months: number | null
          reference_number: string | null
          reporting_to: string | null
          salary_amount: number | null
          salary_currency: string | null
          school_id: string
          signatory_name: string | null
          signatory_title: string | null
          signed_at: string | null
          start_date: string | null
          status: string | null
          terms: string | null
          updated_at: string | null
          user_id: string
          working_hours: string | null
        }
        Insert: {
          benefits?: string | null
          body?: string | null
          contract_type?: string | null
          created_at?: string | null
          department?: string | null
          end_date?: string | null
          id?: string
          notice_period_days?: number | null
          position?: string | null
          probation_period_months?: number | null
          reference_number?: string | null
          reporting_to?: string | null
          salary_amount?: number | null
          salary_currency?: string | null
          school_id: string
          signatory_name?: string | null
          signatory_title?: string | null
          signed_at?: string | null
          start_date?: string | null
          status?: string | null
          terms?: string | null
          updated_at?: string | null
          user_id: string
          working_hours?: string | null
        }
        Update: {
          benefits?: string | null
          body?: string | null
          contract_type?: string | null
          created_at?: string | null
          department?: string | null
          end_date?: string | null
          id?: string
          notice_period_days?: number | null
          position?: string | null
          probation_period_months?: number | null
          reference_number?: string | null
          reporting_to?: string | null
          salary_amount?: number | null
          salary_currency?: string | null
          school_id?: string
          signatory_name?: string | null
          signatory_title?: string | null
          signed_at?: string | null
          start_date?: string | null
          status?: string | null
          terms?: string | null
          updated_at?: string | null
          user_id?: string
          working_hours?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_contracts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_documents: {
        Row: {
          created_at: string | null
          document_name: string
          document_type: string | null
          file_url: string | null
          id: string
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          document_name: string
          document_type?: string | null
          file_url?: string | null
          id?: string
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          document_name?: string
          document_type?: string | null
          file_url?: string | null
          id?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_salary_structure: {
        Row: {
          amount: number
          component_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          employee_user_id: string
          id: string
          notes: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          component_id: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_user_id: string
          id?: string
          notes?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          component_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_user_id?: string
          id?: string
          notes?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_salary_structure_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "hr_salary_components"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_interviews: {
        Row: {
          applicant_id: string
          created_at: string
          duration_minutes: number
          feedback: string | null
          id: string
          interviewer_user_id: string | null
          location_or_link: string | null
          mode: string
          scheduled_at: string
          school_id: string
          score: number | null
          status: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          duration_minutes?: number
          feedback?: string | null
          id?: string
          interviewer_user_id?: string | null
          location_or_link?: string | null
          mode?: string
          scheduled_at: string
          school_id: string
          score?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          duration_minutes?: number
          feedback?: string | null
          id?: string
          interviewer_user_id?: string | null
          location_or_link?: string | null
          mode?: string
          scheduled_at?: string
          school_id?: string
          score?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_interviews_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "hr_applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_job_postings: {
        Row: {
          campus_id: string | null
          closes_at: string | null
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          employment_type: string
          id: string
          location: string | null
          openings: number
          posted_at: string
          requirements: string | null
          school_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          campus_id?: string | null
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          employment_type?: string
          id?: string
          location?: string | null
          openings?: number
          posted_at?: string
          requirements?: string | null
          school_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          campus_id?: string | null
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          employment_type?: string
          id?: string
          location?: string | null
          openings?: number
          posted_at?: string
          requirements?: string | null
          school_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_leave_requests: {
        Row: {
          created_at: string | null
          days_count: number | null
          end_date: string
          id: string
          is_paid: boolean
          leave_type_id: string | null
          max_days: number | null
          reason: string | null
          reviewed_by: string | null
          school_id: string
          start_date: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          days_count?: number | null
          end_date: string
          id?: string
          is_paid?: boolean
          leave_type_id?: string | null
          max_days?: number | null
          reason?: string | null
          reviewed_by?: string | null
          school_id: string
          start_date: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          days_count?: number | null
          end_date?: string
          id?: string
          is_paid?: boolean
          leave_type_id?: string | null
          max_days?: number | null
          reason?: string | null
          reviewed_by?: string | null
          school_id?: string
          start_date?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_types: {
        Row: {
          created_at: string | null
          id: string
          is_paid: boolean | null
          max_days: number | null
          name: string
          school_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_paid?: boolean | null
          max_days?: number | null
          name: string
          school_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_paid?: boolean | null
          max_days?: number | null
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_types_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_onboarding_assignments: {
        Row: {
          created_at: string
          employee_user_id: string
          id: string
          kind: string
          notes: string | null
          school_id: string
          start_date: string
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_user_id: string
          id?: string
          kind?: string
          notes?: string | null
          school_id: string
          start_date?: string
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_user_id?: string
          id?: string
          kind?: string
          notes?: string | null
          school_id?: string
          start_date?: string
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_onboarding_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_onboarding_task_status: {
        Row: {
          assignment_id: string
          created_at: string
          description: string | null
          done_at: string | null
          done_by: string | null
          due_date: string | null
          id: string
          is_done: boolean
          owner_user_id: string | null
          school_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          description?: string | null
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          is_done?: boolean
          owner_user_id?: string | null
          school_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          description?: string | null
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          is_done?: boolean
          owner_user_id?: string | null
          school_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_onboarding_task_status_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "hr_onboarding_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_onboarding_template_tasks: {
        Row: {
          created_at: string
          description: string | null
          due_offset_days: number
          id: string
          owner_role: string | null
          school_id: string
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_offset_days?: number
          id?: string
          owner_role?: string | null
          school_id: string
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_offset_days?: number
          id?: string
          owner_role?: string | null
          school_id?: string
          sort_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_onboarding_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_onboarding_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_pay_runs: {
        Row: {
          created_at: string | null
          deductions: number | null
          gross_amount: number | null
          id: string
          net_amount: number | null
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          school_id: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deductions?: number | null
          gross_amount?: number | null
          id?: string
          net_amount?: number | null
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          school_id: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          deductions?: number | null
          gross_amount?: number | null
          id?: string
          net_amount?: number | null
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          school_id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_pay_runs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          generated_at: string | null
          id: string
          label: string | null
          notes: string | null
          paid_at: string | null
          period_month: number
          period_year: number
          school_id: string
          status: string
          total_deductions: number
          total_gross: number
          total_net: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          generated_at?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          paid_at?: string | null
          period_month: number
          period_year: number
          school_id: string
          status?: string
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          generated_at?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          paid_at?: string | null
          period_month?: number
          period_year?: number
          school_id?: string
          status?: string
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Relationships: []
      }
      hr_payslips: {
        Row: {
          basic: number
          bonus: number
          breakdown: Json
          created_at: string
          deductions: number
          earnings: number
          employee_user_id: string
          generated_at: string | null
          gross: number
          id: string
          net: number
          notes: string | null
          paid_at: string | null
          run_id: string
          school_id: string
          status: string
          tax: number
          total_deductions: number
          total_gross: number
          total_net: number
          updated_at: string
        }
        Insert: {
          basic?: number
          bonus?: number
          breakdown?: Json
          created_at?: string
          deductions?: number
          earnings?: number
          employee_user_id: string
          generated_at?: string | null
          gross?: number
          id?: string
          net?: number
          notes?: string | null
          paid_at?: string | null
          run_id: string
          school_id: string
          status?: string
          tax?: number
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Update: {
          basic?: number
          bonus?: number
          breakdown?: Json
          created_at?: string
          deductions?: number
          earnings?: number
          employee_user_id?: string
          generated_at?: string | null
          gross?: number
          id?: string
          net?: number
          notes?: string | null
          paid_at?: string | null
          run_id?: string
          school_id?: string
          status?: string
          tax?: number
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payslips_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_performance_cycles: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          period_end: string
          period_start: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          period_end: string
          period_start: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_reviews: {
        Row: {
          comments: string | null
          created_at: string | null
          id: string
          rating: number | null
          review_date: string | null
          reviewer_id: string | null
          school_id: string
          status: string | null
          user_id: string
        }
        Insert: {
          comments?: string | null
          created_at?: string | null
          id?: string
          rating?: number | null
          review_date?: string | null
          reviewer_id?: string | null
          school_id: string
          status?: string | null
          user_id: string
        }
        Update: {
          comments?: string | null
          created_at?: string | null
          id?: string
          rating?: number | null
          review_date?: string | null
          reviewer_id?: string | null
          school_id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_reviews_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_salary_components: {
        Row: {
          calc_type: string
          code: string | null
          created_at: string
          default_value: number
          id: string
          is_active: boolean
          is_taxable: boolean
          kind: string
          name: string
          school_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          calc_type?: string
          code?: string | null
          created_at?: string
          default_value?: number
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          kind?: string
          name: string
          school_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          calc_type?: string
          code?: string | null
          created_at?: string
          default_value?: number
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          kind?: string
          name?: string
          school_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      hr_salary_records: {
        Row: {
          allowances: number | null
          base_salary: number
          created_at: string | null
          currency: string | null
          deductions: number | null
          effective_from: string | null
          effective_to: string | null
          id: string
          is_active: boolean | null
          month: number | null
          notes: string | null
          pay_frequency: string | null
          school_id: string
          status: string | null
          updated_at: string | null
          user_id: string
          year: number | null
        }
        Insert: {
          allowances?: number | null
          base_salary?: number
          created_at?: string | null
          currency?: string | null
          deductions?: number | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          month?: number | null
          notes?: string | null
          pay_frequency?: string | null
          school_id: string
          status?: string | null
          updated_at?: string | null
          user_id: string
          year?: number | null
        }
        Update: {
          allowances?: number | null
          base_salary?: number
          created_at?: string | null
          currency?: string | null
          deductions?: number | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          month?: number | null
          notes?: string | null
          pay_frequency?: string | null
          school_id?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_salary_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_staff_attendance: {
        Row: {
          altitude: number | null
          attendance_date: string
          clock_in: string | null
          clock_out: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          recorded_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          altitude?: number | null
          attendance_date?: string
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          recorded_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          altitude?: number | null
          attendance_date?: string
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          recorded_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_staff_attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_staff_directory: {
        Row: {
          address: string | null
          campus_id: string | null
          cnic: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          department: string | null
          email: string | null
          emergency_contact: string | null
          employment_type: string | null
          full_name: string
          gender: string | null
          id: string
          is_active: boolean
          joining_date: string | null
          linked_at: string | null
          linked_user_id: string | null
          notes: string | null
          phone: string | null
          position: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          campus_id?: string | null
          cnic?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          emergency_contact?: string | null
          employment_type?: string | null
          full_name: string
          gender?: string | null
          id?: string
          is_active?: boolean
          joining_date?: string | null
          linked_at?: string | null
          linked_user_id?: string | null
          notes?: string | null
          phone?: string | null
          position?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          campus_id?: string | null
          cnic?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          emergency_contact?: string | null
          employment_type?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          joining_date?: string | null
          linked_at?: string | null
          linked_user_id?: string | null
          notes?: string | null
          phone?: string | null
          position?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_staff_directory_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_staff_directory_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      jazzcash_settings: {
        Row: {
          created_at: string
          environment: Database["public"]["Enums"]["jazzcash_env"]
          id: string
          integrity_salt: string | null
          is_enabled: boolean
          merchant_id: string | null
          merchant_password: string | null
          return_url: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          environment?: Database["public"]["Enums"]["jazzcash_env"]
          id?: string
          integrity_salt?: string | null
          is_enabled?: boolean
          merchant_id?: string | null
          merchant_password?: string | null
          return_url?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          environment?: Database["public"]["Enums"]["jazzcash_env"]
          id?: string
          integrity_salt?: string | null
          is_enabled?: boolean
          merchant_id?: string | null
          merchant_password?: string | null
          return_url?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      jazzcash_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          initiator_user_id: string | null
          invoice_id: string
          jc_response_code: string | null
          jc_response_message: string | null
          raw_request: Json | null
          raw_response: Json | null
          school_id: string
          status: Database["public"]["Enums"]["fee_payment_status"]
          student_id: string
          txn_ref_no: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          initiator_user_id?: string | null
          invoice_id: string
          jc_response_code?: string | null
          jc_response_message?: string | null
          raw_request?: Json | null
          raw_response?: Json | null
          school_id: string
          status?: Database["public"]["Enums"]["fee_payment_status"]
          student_id: string
          txn_ref_no: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          initiator_user_id?: string | null
          invoice_id?: string
          jc_response_code?: string | null
          jc_response_message?: string | null
          raw_request?: Json | null
          raw_response?: Json | null
          school_id?: string
          status?: Database["public"]["Enums"]["fee_payment_status"]
          student_id?: string
          txn_ref_no?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jazzcash_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "fee_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plans: {
        Row: {
          class_section_id: string
          created_at: string | null
          id: string
          notes: string | null
          objectives: string | null
          period_label: string
          plan_date: string
          resources: string | null
          school_id: string
          status: string
          subject_id: string | null
          teacher_user_id: string
          topic: string
          updated_at: string | null
        }
        Insert: {
          class_section_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          objectives?: string | null
          period_label?: string
          plan_date: string
          resources?: string | null
          school_id: string
          status?: string
          subject_id?: string | null
          teacher_user_id: string
          topic: string
          updated_at?: string | null
        }
        Update: {
          class_section_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          objectives?: string | null
          period_label?: string
          plan_date?: string
          resources?: string | null
          school_id?: string
          status?: string
          subject_id?: string | null
          teacher_user_id?: string
          topic?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plans_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          audience: string
          body: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          pinned: boolean
          priority: string
          publish_at: string | null
          school_id: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          pinned?: boolean
          priority?: string
          publish_at?: string | null
          school_id: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          pinned?: boolean
          priority?: string
          publish_at?: string | null
          school_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: string
          channel: string
          created_at: string | null
          enabled: boolean | null
          id: string
          school_id: string
          user_id: string
        }
        Insert: {
          category: string
          channel?: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          school_id: string
          user_id: string
        }
        Update: {
          category?: string
          channel?: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_active_context: {
        Row: {
          active_campus_id: string | null
          active_school_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_campus_id?: string | null
          active_school_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_campus_id?: string | null
          active_school_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_active_context_active_campus_id_fkey"
            columns: ["active_campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_active_context_active_school_id_fkey"
            columns: ["active_school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_behavior_notes: {
        Row: {
          behavior: string | null
          created_at: string
          id: string
          mood: string | null
          note_date: string
          parent_user_id: string
          routine: string | null
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          behavior?: string | null
          created_at?: string
          id?: string
          mood?: string | null
          note_date?: string
          parent_user_id: string
          routine?: string | null
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          behavior?: string | null
          created_at?: string
          id?: string
          mood?: string | null
          note_date?: string
          parent_user_id?: string
          routine?: string | null
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_behavior_notes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_behavior_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_messages: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          recipient_user_id: string
          school_id: string
          sender_user_id: string
          student_id: string | null
          subject: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          recipient_user_id: string
          school_id: string
          sender_user_id: string
          student_id?: string | null
          subject?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          recipient_user_id?: string
          school_id?: string
          sender_user_id?: string
          student_id?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_messages_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_notifications: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          notification_type: string | null
          parent_user_id: string
          read_at: string | null
          school_id: string
          student_id: string | null
          title: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          notification_type?: string | null
          parent_user_id: string
          read_at?: string | null
          school_id: string
          student_id?: string | null
          title: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          notification_type?: string | null
          parent_user_id?: string
          read_at?: string | null
          school_id?: string
          student_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_rate_limits: {
        Row: {
          email_hash: string
          id: string
          requested_at: string
        }
        Insert: {
          email_hash: string
          id?: string
          requested_at?: string
        }
        Update: {
          email_hash?: string
          id?: string
          requested_at?: string
        }
        Relationships: []
      }
      platform_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          message: string
          request_type: string
          requester_user_id: string
          school_id: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          message: string
          request_type: string
          requester_user_id: string
          school_id?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          message?: string
          request_type?: string
          requester_user_id?: string
          school_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_super_admins: {
        Row: {
          created_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      report_cards: {
        Row: {
          academic_year: string | null
          attendance_percentage: number | null
          campus_id: string | null
          created_at: string
          exam_id: string | null
          gpa: number | null
          id: string
          is_published: boolean
          last_edited_by: string | null
          max_total: number | null
          overall_grade: string | null
          percentage: number | null
          period_end: string | null
          period_label: string | null
          period_start: string | null
          period_type: string
          principal_remarks: string | null
          published_at: string | null
          school_id: string
          student_id: string
          teacher_remarks: string | null
          total_marks: number | null
          updated_at: string
        }
        Insert: {
          academic_year?: string | null
          attendance_percentage?: number | null
          campus_id?: string | null
          created_at?: string
          exam_id?: string | null
          gpa?: number | null
          id?: string
          is_published?: boolean
          last_edited_by?: string | null
          max_total?: number | null
          overall_grade?: string | null
          percentage?: number | null
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          period_type?: string
          principal_remarks?: string | null
          published_at?: string | null
          school_id: string
          student_id: string
          teacher_remarks?: string | null
          total_marks?: number | null
          updated_at?: string
        }
        Update: {
          academic_year?: string | null
          attendance_percentage?: number | null
          campus_id?: string | null
          created_at?: string
          exam_id?: string | null
          gpa?: number | null
          id?: string
          is_published?: boolean
          last_edited_by?: string | null
          max_total?: number | null
          overall_grade?: string | null
          percentage?: number | null
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          period_type?: string
          principal_remarks?: string | null
          published_at?: string | null
          school_id?: string
          student_id?: string
          teacher_remarks?: string | null
          total_marks?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_budget_targets: {
        Row: {
          budget_amount: number | null
          created_at: string | null
          department: string | null
          fiscal_year: number | null
          id: string
          notes: string | null
          role: string | null
          school_id: string
        }
        Insert: {
          budget_amount?: number | null
          created_at?: string | null
          department?: string | null
          fiscal_year?: number | null
          id?: string
          notes?: string | null
          role?: string | null
          school_id: string
        }
        Update: {
          budget_amount?: number | null
          created_at?: string | null
          department?: string | null
          fiscal_year?: number | null
          id?: string
          notes?: string | null
          role?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_budget_targets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          attachment_urls: string[] | null
          content: string
          created_at: string | null
          error_message: string | null
          id: string
          message_type: string
          recipient_user_ids: string[]
          scheduled_at: string
          school_id: string
          sender_user_id: string
          sent_at: string | null
          status: string | null
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          attachment_urls?: string[] | null
          content: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_type: string
          recipient_user_ids: string[]
          scheduled_at: string
          school_id: string
          sender_user_id: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          attachment_urls?: string[] | null
          content?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_type?: string
          recipient_user_ids?: string[]
          scheduled_at?: string
          school_id?: string
          sender_user_id?: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_alert_settings: {
        Row: {
          attendance_critical_threshold: number
          attendance_warning_threshold: number
          created_at: string
          id: string
          pending_invoices_threshold: number
          school_id: string
          support_ticket_hours: number
          updated_at: string
        }
        Insert: {
          attendance_critical_threshold?: number
          attendance_warning_threshold?: number
          created_at?: string
          id?: string
          pending_invoices_threshold?: number
          school_id: string
          support_ticket_hours?: number
          updated_at?: string
        }
        Update: {
          attendance_critical_threshold?: number
          attendance_warning_threshold?: number
          created_at?: string
          id?: string
          pending_invoices_threshold?: number
          school_id?: string
          support_ticket_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_alert_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_branding: {
        Row: {
          accent_hue: number | null
          accent_lightness: number | null
          accent_saturation: number | null
          altitude: number | null
          created_at: string | null
          id: string
          latitude: number | null
          longitude: number | null
          radius_scale: number | null
          school_id: string
          updated_at: string | null
        }
        Insert: {
          accent_hue?: number | null
          accent_lightness?: number | null
          accent_saturation?: number | null
          altitude?: number | null
          created_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          radius_scale?: number | null
          school_id: string
          updated_at?: string | null
        }
        Update: {
          accent_hue?: number | null
          accent_lightness?: number | null
          accent_saturation?: number | null
          altitude?: number | null
          created_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          radius_scale?: number | null
          school_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_branding_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_memberships: {
        Row: {
          created_at: string | null
          id: string
          school_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          school_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          school_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_memberships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_owner_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          owner_user_id: string
          school_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          owner_user_id: string
          school_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          owner_user_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_owner_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          altitude: number | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          motto: string | null
          name: string
          phone: string | null
          slug: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          altitude?: number | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          motto?: string | null
          name: string
          phone?: string | null
          slug: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          altitude?: number | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          motto?: string | null
          name?: string
          phone?: string | null
          slug?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      section_subjects: {
        Row: {
          class_section_id: string
          created_at: string | null
          id: string
          school_id: string
          subject_id: string
          teacher_user_id: string | null
        }
        Insert: {
          class_section_id: string
          created_at?: string | null
          id?: string
          school_id: string
          subject_id: string
          teacher_user_id?: string | null
        }
        Update: {
          class_section_id?: string
          created_at?: string | null
          id?: string
          school_id?: string
          subject_id?: string
          teacher_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "section_subjects_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_campus_assignments: {
        Row: {
          campus_id: string
          created_at: string | null
          id: string
          role: string | null
          user_id: string
        }
        Insert: {
          campus_id: string
          created_at?: string | null
          id?: string
          role?: string | null
          user_id: string
        }
        Update: {
          campus_id?: string
          created_at?: string | null
          id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_campus_assignments_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      student_certificates: {
        Row: {
          certificate_type: string | null
          created_at: string | null
          description: string | null
          file_url: string | null
          id: string
          issued_at: string | null
          issued_date: string | null
          school_id: string
          student_id: string
          title: string
        }
        Insert: {
          certificate_type?: string | null
          created_at?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          issued_at?: string | null
          issued_date?: string | null
          school_id: string
          student_id: string
          title: string
        }
        Update: {
          certificate_type?: string | null
          created_at?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          issued_at?: string | null
          issued_date?: string | null
          school_id?: string
          student_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_certificates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_certificates_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_enrollments: {
        Row: {
          class_section_id: string
          created_at: string | null
          end_date: string | null
          id: string
          school_id: string
          start_date: string | null
          student_id: string
        }
        Insert: {
          class_section_id: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          school_id: string
          start_date?: string | null
          student_id: string
        }
        Update: {
          class_section_id?: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          school_id?: string
          start_date?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollments_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_fee_assignments: {
        Row: {
          created_at: string
          discount_pct: number
          fee_plan_id: string
          id: string
          is_active: boolean
          notes: string | null
          scholarship_amount: number
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_pct?: number
          fee_plan_id: string
          id?: string
          is_active?: boolean
          notes?: string | null
          scholarship_amount?: number
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_pct?: number
          fee_plan_id?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          scholarship_amount?: number
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_fee_assignments_fee_plan_id_fkey"
            columns: ["fee_plan_id"]
            isOneToOne: false
            referencedRelation: "fee_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_emergency_contact: boolean | null
          is_primary: boolean | null
          phone: string | null
          relationship: string | null
          school_id: string | null
          student_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_emergency_contact?: boolean | null
          is_primary?: boolean | null
          phone?: string | null
          relationship?: string | null
          school_id?: string | null
          student_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_emergency_contact?: boolean | null
          is_primary?: boolean | null
          phone?: string | null
          relationship?: string | null
          school_id?: string | null
          student_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_marks: {
        Row: {
          assessment_date: string | null
          assessment_id: string
          campus_id: string | null
          computed_grade: string | null
          created_at: string | null
          created_by: string | null
          grade_points: number | null
          id: string
          is_published: boolean
          marks: number | null
          max_marks: number | null
          published_at: string | null
          remarks: string | null
          school_id: string
          sender_user_id: string | null
          student_id: string
        }
        Insert: {
          assessment_date?: string | null
          assessment_id: string
          campus_id?: string | null
          computed_grade?: string | null
          created_at?: string | null
          created_by?: string | null
          grade_points?: number | null
          id?: string
          is_published?: boolean
          marks?: number | null
          max_marks?: number | null
          published_at?: string | null
          remarks?: string | null
          school_id: string
          sender_user_id?: string | null
          student_id: string
        }
        Update: {
          assessment_date?: string | null
          assessment_id?: string
          campus_id?: string | null
          computed_grade?: string | null
          created_at?: string | null
          created_by?: string | null
          grade_points?: number | null
          id?: string
          is_published?: boolean
          marks?: number | null
          max_marks?: number | null
          published_at?: string | null
          remarks?: string | null
          school_id?: string
          sender_user_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_marks_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "academic_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_marks_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_marks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_marks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_results: {
        Row: {
          assignment_id: string
          created_at: string | null
          grade: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          marks_obtained: number | null
          remarks: string | null
          school_id: string
          student_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string | null
          grade?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          marks_obtained?: number | null
          remarks?: string | null
          school_id: string
          student_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string | null
          grade?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          marks_obtained?: number | null
          remarks?: string | null
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_results_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          admission_date: string | null
          area: string | null
          blood_group: string | null
          campus_id: string | null
          card_valid_until: string | null
          city: string | null
          class_section_id: string | null
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          emergency_contact: string | null
          end_date: string | null
          first_name: string
          gender: string | null
          id: string
          last_name: string | null
          medical_notes: string | null
          notes: string | null
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          phone: string | null
          profile_id: string | null
          profile_image_url: string | null
          registration_number: string | null
          roll_number: string | null
          school_id: string
          status: string | null
          student_code: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          admission_date?: string | null
          area?: string | null
          blood_group?: string | null
          campus_id?: string | null
          card_valid_until?: string | null
          city?: string | null
          class_section_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          emergency_contact?: string | null
          end_date?: string | null
          first_name: string
          gender?: string | null
          id?: string
          last_name?: string | null
          medical_notes?: string | null
          notes?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          profile_id?: string | null
          profile_image_url?: string | null
          registration_number?: string | null
          roll_number?: string | null
          school_id: string
          status?: string | null
          student_code?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          admission_date?: string | null
          area?: string | null
          blood_group?: string | null
          campus_id?: string | null
          card_valid_until?: string | null
          city?: string | null
          class_section_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          emergency_contact?: string | null
          end_date?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string | null
          medical_notes?: string | null
          notes?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          profile_id?: string | null
          profile_image_url?: string | null
          registration_number?: string | null
          roll_number?: string | null
          school_id?: string
          status?: string | null
          student_code?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_students_campus"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string | null
          id: string
          name: string
          school_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          id?: string
          name: string
          school_id: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      support_conversations: {
        Row: {
          created_at: string | null
          id: string
          school_id: string
          status: string | null
          student_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          school_id: string
          status?: string | null
          student_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          school_id?: string
          status?: string | null
          student_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_conversations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_conversations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          school_id: string
          sender_user_id: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          school_id: string
          sender_user_id?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          school_id?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_assignments: {
        Row: {
          class_section_id: string
          created_at: string | null
          id: string
          school_id: string
          subject_id: string | null
          teacher_user_id: string
        }
        Insert: {
          class_section_id: string
          created_at?: string | null
          id?: string
          school_id: string
          subject_id?: string | null
          teacher_user_id: string
        }
        Update: {
          class_section_id?: string
          created_at?: string | null
          id?: string
          school_id?: string
          subject_id?: string | null
          teacher_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_assignments_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_period_logs: {
        Row: {
          created_at: string | null
          id: string
          logged_at: string
          notes: string | null
          school_id: string
          status: string | null
          teacher_user_id: string | null
          timetable_entry_id: string
          topic_covered: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          logged_at: string
          notes?: string | null
          school_id: string
          status?: string | null
          teacher_user_id?: string | null
          timetable_entry_id: string
          topic_covered?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          logged_at?: string
          notes?: string | null
          school_id?: string
          status?: string | null
          teacher_user_id?: string | null
          timetable_entry_id?: string
          topic_covered?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_period_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_period_logs_timetable_entry_id_fkey"
            columns: ["timetable_entry_id"]
            isOneToOne: false
            referencedRelation: "timetable_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_period_presence: {
        Row: {
          created_at: string
          entered_at: string | null
          id: string
          left_at: string | null
          notes: string | null
          period_date: string
          reason: string | null
          school_id: string
          status: string
          teacher_user_id: string
          timetable_entry_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entered_at?: string | null
          id?: string
          left_at?: string | null
          notes?: string | null
          period_date?: string
          reason?: string | null
          school_id: string
          status: string
          teacher_user_id: string
          timetable_entry_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entered_at?: string | null
          id?: string
          left_at?: string | null
          notes?: string | null
          period_date?: string
          reason?: string | null
          school_id?: string
          status?: string
          teacher_user_id?: string
          timetable_entry_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      teacher_presence_audit: {
        Row: {
          changed_by_user_id: string | null
          created_at: string
          id: string
          new_status: string
          old_status: string | null
          period_date: string
          reason: string | null
          school_id: string
          teacher_user_id: string
          timetable_entry_id: string
        }
        Insert: {
          changed_by_user_id?: string | null
          created_at?: string
          id?: string
          new_status: string
          old_status?: string | null
          period_date: string
          reason?: string | null
          school_id: string
          teacher_user_id: string
          timetable_entry_id: string
        }
        Update: {
          changed_by_user_id?: string | null
          created_at?: string
          id?: string
          new_status?: string
          old_status?: string | null
          period_date?: string
          reason?: string | null
          school_id?: string
          teacher_user_id?: string
          timetable_entry_id?: string
        }
        Relationships: []
      }
      teacher_subject_assignments: {
        Row: {
          class_section_id: string
          created_at: string | null
          id: string
          school_id: string
          subject_id: string
          teacher_id: string | null
          teacher_user_id: string
        }
        Insert: {
          class_section_id: string
          created_at?: string | null
          id?: string
          school_id: string
          subject_id: string
          teacher_id?: string | null
          teacher_user_id: string
        }
        Update: {
          class_section_id?: string
          created_at?: string | null
          id?: string
          school_id?: string
          subject_id?: string
          teacher_id?: string | null
          teacher_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_subject_assignments_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subject_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subject_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_entries: {
        Row: {
          class_section_id: string
          created_at: string | null
          day_of_week: number
          end_time: string | null
          id: string
          is_published: boolean | null
          period_id: string | null
          published_at: string | null
          room: string | null
          school_id: string
          start_time: string | null
          subject_name: string | null
          teacher_id: string | null
          teacher_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          class_section_id: string
          created_at?: string | null
          day_of_week: number
          end_time?: string | null
          id?: string
          is_published?: boolean | null
          period_id?: string | null
          published_at?: string | null
          room?: string | null
          school_id: string
          start_time?: string | null
          subject_name?: string | null
          teacher_id?: string | null
          teacher_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          class_section_id?: string
          created_at?: string | null
          day_of_week?: number
          end_time?: string | null
          id?: string
          is_published?: boolean | null
          period_id?: string | null
          published_at?: string | null
          room?: string | null
          school_id?: string
          start_time?: string | null
          subject_name?: string | null
          teacher_id?: string | null
          teacher_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_entries_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "timetable_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_entries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_periods: {
        Row: {
          created_at: string | null
          end_time: string | null
          id: string
          is_break: boolean | null
          label: string
          school_id: string
          sort_order: number | null
          start_time: string | null
        }
        Insert: {
          created_at?: string | null
          end_time?: string | null
          id?: string
          is_break?: boolean | null
          label: string
          school_id: string
          sort_order?: number | null
          start_time?: string | null
        }
        Update: {
          created_at?: string | null
          end_time?: string | null
          id?: string
          is_break?: boolean | null
          label?: string
          school_id?: string
          sort_order?: number | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_periods_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_settings: {
        Row: {
          created_at: string | null
          id: string
          school_id: string
          updated_at: string | null
          working_days: number[] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          school_id: string
          updated_at?: string | null
          working_days?: number[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          school_id?: string
          updated_at?: string | null
          working_days?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          end_date: string | null
          id: string
          role: string
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          role: string
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          role?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_messages: {
        Row: {
          channel: string
          content: string
          created_at: string | null
          id: string
          parent_message_id: string | null
          reactions: Json | null
          school_id: string
          sender_user_id: string
        }
        Insert: {
          channel: string
          content: string
          created_at?: string | null
          id?: string
          parent_message_id?: string | null
          reactions?: Json | null
          school_id: string
          sender_user_id: string
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string | null
          id?: string
          parent_message_id?: string | null
          reactions?: Json | null
          school_id?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "workspace_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      complaint_feedbacks_principal_view: {
        Row: {
          author_role: string | null
          author_user_id: string | null
          complaint_id: string | null
          content: string | null
          created_at: string | null
          id: string | null
          school_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_feedbacks_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_feedbacks_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints_principal_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_feedbacks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints_principal_view: {
        Row: {
          category: string | null
          content: string | null
          created_at: string | null
          flow: string | null
          id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          school_id: string | null
          sender_user_id: string | null
          status: string | null
          student_id: string | null
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          flow?: string | null
          id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string | null
          sender_user_id?: never
          status?: string | null
          student_id?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          flow?: string | null
          id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string | null
          sender_user_id?: never
          status?: string | null
          student_id?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaints_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      school_user_directory: {
        Row: {
          display_name: string | null
          email: string | null
          school_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_memberships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_create_campus: {
        Args: {
          _address?: string
          _code?: string
          _is_active?: boolean
          _name: string
          _school_id: string
          _slug: string
        }
        Returns: {
          address: string | null
          code: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          principal_user_id: string | null
          school_id: string
          slug: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "campuses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_schools_basic: {
        Args: never
        Returns: {
          id: string
          is_active: boolean
          name: string
          slug: string
        }[]
      }
      can_access_complaint: {
        Args: { _complaint_id: string }
        Returns: boolean
      }
      can_edit_attendance: { Args: { _school_id: string }; Returns: boolean }
      can_manage_admissions: { Args: { _school_id: string }; Returns: boolean }
      can_manage_easypaisa: { Args: { _school_id: string }; Returns: boolean }
      can_manage_exam_datesheet: {
        Args: { _class_section_id?: string; _school_id: string }
        Returns: boolean
      }
      can_manage_finance: { Args: { _school_id: string }; Returns: boolean }
      can_manage_hr: { Args: { _school_id: string }; Returns: boolean }
      can_manage_jazzcash: { Args: { _school_id: string }; Returns: boolean }
      can_manage_staff: { Args: { _school_id: string }; Returns: boolean }
      can_manage_students: { Args: { _school_id: string }; Returns: boolean }
      can_publish_results: { Args: { _school_id: string }; Returns: boolean }
      can_view_counseling: { Args: { _school_id: string }; Returns: boolean }
      can_view_crm: { Args: { _school_id: string }; Returns: boolean }
      can_view_fees: { Args: { _school_id: string }; Returns: boolean }
      can_work_crm: { Args: { _school_id: string }; Returns: boolean }
      check_exam_subject_conflicts: {
        Args: { _exam_id: string; _school_id: string }
        Returns: {
          a_end: string
          a_id: string
          a_start: string
          b_end: string
          b_id: string
          b_start: string
          conflict_type: string
          exam_date: string
          invigilator_user_id: string
          room: string
        }[]
      }
      convert_admission_to_student: {
        Args: { _application_id: string }
        Returns: string
      }
      find_parent_user_by_email: {
        Args: { _email: string; _school_id: string }
        Returns: string
      }
      generate_fee_voucher: {
        Args: {
          _batch_id?: string
          _due_date: string
          _extra_discount_amount?: number
          _extra_discount_pct?: number
          _extra_discount_reason?: string
          _fee_plan_id: string
          _notes?: string
          _period_label: string
          _school_id: string
          _student_id: string
        }
        Returns: string
      }
      generate_invoice_for_student: {
        Args: {
          _due_date: string
          _fee_plan_id: string
          _period_label: string
          _school_id: string
          _student_id: string
        }
        Returns: string
      }
      generate_invoice_number: { Args: { _school_id: string }; Returns: string }
      get_at_risk_students: {
        Args: { _class_section_id?: string; _school_id: string }
        Returns: {
          attendance_rate: number
          avg_grade_percentage: number
          class_name: string
          class_section_id: string
          first_name: string
          last_name: string
          recent_grade_avg: number
          risk_reason: string
          section_name: string
          student_id: string
        }[]
      }
      get_school_public_by_slug: {
        Args: { _slug: string }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      get_school_staff_directory: {
        Args: { _school_id: string }
        Returns: {
          display_name: string
          email: string
          school_id: string
          user_id: string
        }[]
      }
      get_school_user_directory: {
        Args: { _school_id: string }
        Returns: {
          display_name: string
          email: string
          school_id: string
          user_id: string
        }[]
      }
      has_role:
        | { Args: { _role: string; _school_id: string }; Returns: boolean }
        | {
            Args: { _role: string; _school_id: string; _user_id: string }
            Returns: boolean
          }
      insert_exam_datesheet_notifications: {
        Args: { _class_section_id?: string; _exam_id: string }
        Returns: number
      }
      is_campus_member: {
        Args: { _campus_id: string; _user_id: string }
        Returns: boolean
      }
      is_easypaisa_enabled: { Args: { _school_id: string }; Returns: boolean }
      is_jazzcash_enabled: { Args: { _school_id: string }; Returns: boolean }
      is_my_child: {
        Args: { _school_id: string; _student_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_school_admin: { Args: { _school_id: string }; Returns: boolean }
      is_school_member: {
        Args: { _school_id: string; _user_id: string }
        Returns: boolean
      }
      list_existing_school_owners: {
        Args: never
        Returns: {
          display_name: string
          email: string
          school_count: number
          user_id: string
        }[]
      }
      list_school_user_profiles: {
        Args: { _school_id: string }
        Returns: {
          display_name: string
          email: string
          user_id: string
        }[]
      }
      my_children: { Args: { _school_id: string }; Returns: string[] }
      my_children_detailed: {
        Args: { _school_id: string }
        Returns: {
          class_name: string
          class_section_id: string
          date_of_birth: string
          first_name: string
          gender: string
          last_name: string
          profile_image_url: string
          roll_number: string
          section_name: string
          student_code: string
          student_id: string
        }[]
      }
      my_student_id: { Args: { _school_id: string }; Returns: string }
      notify_exam_datesheet_ready: {
        Args: { _class_section_id?: string; _exam_id: string }
        Returns: number
      }
      notify_exam_result_publish: {
        Args: {
          _exam_id: string
          _is_published: boolean
          _message?: string
          _scope: string
          _section_id?: string
          _student_id?: string
        }
        Returns: number
      }
      owner_campuses: {
        Args: { _school_id: string }
        Returns: {
          code: string
          id: string
          is_active: boolean
          name: string
          principal_user_id: string
          school_id: string
        }[]
      }
      owner_schools: {
        Args: never
        Returns: {
          id: string
          is_active: boolean
          logo_url: string
          name: string
          slug: string
        }[]
      }
      owner_schools_strict: {
        Args: never
        Returns: {
          id: string
          is_active: boolean
          logo_url: string
          name: string
          slug: string
        }[]
      }
      process_scheduled_datesheet_notifications: {
        Args: never
        Returns: number
      }
      process_scheduled_exam_publications: { Args: never; Returns: number }
      recalc_invoice_totals: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      shares_school: { Args: { _a: string; _b: string }; Returns: boolean }
      student_sibling_rank: {
        Args: { _school_id: string; _student_id: string }
        Returns: number
      }
      verify_fee_payment_proof: {
        Args: {
          _amount?: number
          _approve: boolean
          _proof_id: string
          _reason?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      admission_status:
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "withdrawn"
      easypaisa_env: "sandbox" | "live"
      fee_billing_frequency: "monthly" | "quarterly" | "yearly" | "one_time"
      fee_invoice_status:
        | "draft"
        | "pending"
        | "partial"
        | "paid"
        | "overdue"
        | "cancelled"
      fee_item_category:
        | "tuition"
        | "admission"
        | "exam"
        | "transport"
        | "hostel"
        | "library"
        | "lab"
        | "uniform"
        | "other"
      fee_payment_method:
        | "cash"
        | "bank_transfer"
        | "jazzcash"
        | "easypaisa"
        | "card"
        | "cheque"
        | "other"
      fee_payment_status: "pending" | "success" | "failed" | "refunded"
      jazzcash_env: "sandbox" | "live"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admission_status: [
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "withdrawn",
      ],
      easypaisa_env: ["sandbox", "live"],
      fee_billing_frequency: ["monthly", "quarterly", "yearly", "one_time"],
      fee_invoice_status: [
        "draft",
        "pending",
        "partial",
        "paid",
        "overdue",
        "cancelled",
      ],
      fee_item_category: [
        "tuition",
        "admission",
        "exam",
        "transport",
        "hostel",
        "library",
        "lab",
        "uniform",
        "other",
      ],
      fee_payment_method: [
        "cash",
        "bank_transfer",
        "jazzcash",
        "easypaisa",
        "card",
        "cheque",
        "other",
      ],
      fee_payment_status: ["pending", "success", "failed", "refunded"],
      jazzcash_env: ["sandbox", "live"],
    },
  },
} as const
